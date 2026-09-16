import prisma from "../config/prisma.js";
import {
    formatAcademicYearLabel,
    syncAcademicYearActiveFlags,
} from "../helpers/academicYear.helper.js";
import { ROLES } from "../constants/roles.js";
import { createNotificationEventForUsers } from "../services/notification.service.js";
import { getPeriodSnapshotCoverage } from "../services/studentPeriodSnapshot.service.js";
import { closeUnfinishedMetopenForYear } from "../services/metopenPeriodClose.service.js";

async function findActiveUserIdsByRole(roleName) {
    const rows = await prisma.userHasRole.findMany({
        where: { status: "active", role: { name: roleName } },
        select: { userId: true },
    });
    return rows.map((row) => row.userId);
}

/**
 * Periksa kelengkapan snapshot akademik periode yang baru aktif.
 * Tidak memblokir aktivasi: kekurangan snapshot dilaporkan sebagai peringatan
 * plus rujukan ke jalur perbaikan (backfill Admin), karena memblokir pergantian
 * periode akan mengunci seluruh operasi semester baru.
 */
async function reportPeriodSnapshotCoverage(academicYear, { notify }) {
    let coverage = null;
    try {
        coverage = await getPeriodSnapshotCoverage(academicYear.id);
    } catch (coverageError) {
        console.error(
            "[AcademicYear Sync] Gagal memeriksa kelengkapan snapshot periode:",
            coverageError?.message ?? coverageError,
        );
        return null;
    }

    if (coverage.complete) return coverage;

    console.warn(
        `[AcademicYear Sync] Snapshot akademik ${formatAcademicYearLabel(academicYear)} belum lengkap: ` +
        `${coverage.coverageLabel} mahasiswa punya snapshot, ${coverage.pendingCreate} bisa dibentuk dari data terakhir. ` +
        "Jalankan backfill snapshot periode (Admin) sebelum operasi semester berjalan.",
    );

    if (!notify) return coverage;

    try {
        const adminUserIds = await findActiveUserIdsByRole(ROLES.ADMIN);
        if (adminUserIds.length === 0) return coverage;

        await createNotificationEventForUsers(
            adminUserIds,
            {
                title: "Snapshot Akademik Periode Belum Lengkap",
                message:
                    `Periode ${formatAcademicYearLabel(academicYear)} baru memiliki data akademik ` +
                    `${coverage.coverageLabel} mahasiswa. Lengkapi dari Master Data > Tahun Ajaran ` +
                    "agar daftar mahasiswa Metode Penelitian dan penilaian tidak kosong.",
                type: "simpta_period_snapshot_incomplete",
                data: {
                    academicYearId: academicYear.id,
                    studentsWithSnapshot: coverage.studentsWithSnapshot,
                    totalStudents: coverage.totalStudents,
                    pendingCreate: coverage.pendingCreate,
                },
            },
            { push: true },
        );
    } catch (notificationError) {
        console.error(
            "[AcademicYear Sync] Peringatan snapshot gagal dikirim ke Admin:",
            notificationError?.message ?? notificationError,
        );
    }

    return coverage;
}

async function notifyAdminPeriodCloseFailed(year, closeError) {
    const adminUserIds = await findActiveUserIdsByRole(ROLES.ADMIN);
    if (adminUserIds.length === 0) return;
    await createNotificationEventForUsers(
        adminUserIds,
        {
            title: "Tutup periode Metopel gagal",
            message:
                `Penutupan in-flight ${formatAcademicYearLabel(year)} gagal. ` +
                "Tahun ajaran boleh tetap berganti, tetapi tutup periode wajib diulang sampai sukses. " +
                (closeError?.message ?? "Kesalahan tidak diketahui."),
            type: "simpta_metopen_period_close_failed",
            data: {
                closedAcademicYearId: year.id,
                error: closeError?.message ?? String(closeError),
            },
        },
        { push: true },
    );
}

/**
 * BR-29 retry: ganti tahun tidak ditahan, tetapi close in-flight pada tahun
 * non-aktif yang masih `isProposal` wajib diulang setiap sync sampai sukses.
 */
async function closeLeftoverMetopenOnInactiveYears(activeYearId) {
    const leftoverYears = await prisma.academicYear.findMany({
        where: {
            isActive: false,
            ...(activeYearId ? { id: { not: activeYearId } } : {}),
            thesis: { some: { isProposal: true } },
        },
        select: { id: true, year: true, semester: true, startDate: true },
        orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
    });

    const runs = [];
    for (const year of leftoverYears) {
        try {
            const closeResult = await closeUnfinishedMetopenForYear(year.id);
            console.log(
                `[AcademicYear Sync] Closed unfinished Metopel for ${formatAcademicYearLabel(year)}:`,
                closeResult?.counts,
            );
            runs.push({
                closedAcademicYearId: closeResult.closedAcademicYearId,
                counts: closeResult.counts,
            });
        } catch (closeError) {
            console.error(
                "[AcademicYear Sync] Gagal menutup penilaian Metopel in-flight periode lama:",
                closeError?.message ?? closeError,
            );
            try {
                await notifyAdminPeriodCloseFailed(year, closeError);
            } catch (notificationError) {
                console.error(
                    "[AcademicYear Sync] Alert Admin tutup periode gagal dikirim:",
                    notificationError?.message ?? notificationError,
                );
            }
            throw closeError;
        }
    }

    if (runs.length === 0) return null;
    return {
        closedAcademicYearId: runs[0].closedAcademicYearId,
        closedAcademicYearIds: runs.map((run) => run.closedAcademicYearId),
        counts: runs[0].counts,
        runs,
    };
}

export async function syncActiveAcademicYear() {
    const previousActive = await prisma.academicYear.findFirst({
        where: { isActive: true },
        orderBy: [{ startDate: "desc" }, { createdAt: "asc" }],
    });

    const result = await syncAcademicYearActiveFlags();
    const currentActive = result.activeId
        ? await prisma.academicYear.findUnique({ where: { id: result.activeId } })
        : null;

    if (!currentActive) {
        throw new Error(
            "Tidak ada tahun akademik operasional. Academic-year sync dibatalkan.",
        );
    }

    const changed = previousActive?.id !== currentActive.id;
    if (changed) {
        console.log(
            `[AcademicYear Sync] Active period: ${formatAcademicYearLabel(previousActive)} -> ${formatAcademicYearLabel(currentActive)}`,
        );

        const kadepUserIds = await findActiveUserIdsByRole(ROLES.KETUA_DEPARTEMEN);
        if (kadepUserIds.length > 0 && previousActive) {
            try {
                await createNotificationEventForUsers(
                    kadepUserIds,
                    {
                        title: "Periode Akademik Berganti",
                        message:
                            `Periode aktif berubah ke ${formatAcademicYearLabel(currentActive)}. ` +
                            `Tinjau dan finalisasi batch TA-04 ${formatAcademicYearLabel(previousActive)} secara manual bila masih ada cohort yang belum diterbitkan.`,
                        type: "simpta_academic_year_changed",
                        data: {
                            previousAcademicYearId: previousActive.id,
                            activeAcademicYearId: currentActive.id,
                        },
                    },
                    { push: true },
                );
            } catch (notificationError) {
                console.error(
                    "[AcademicYear Sync] Period changed, but KaDep reminder failed:",
                    notificationError?.message ?? notificationError,
                );
            }
        }
    }

    const periodCloseResult = await closeLeftoverMetopenOnInactiveYears(currentActive.id);

    const coverage = await reportPeriodSnapshotCoverage(currentActive, {
        notify: changed,
    });

    return {
        synced: true,
        changed,
        previousAcademicYearId: previousActive?.id ?? null,
        activeAcademicYearId: currentActive.id,
        updatedFlags: result.updated,
        snapshotCoverage: coverage
            ? {
                studentsWithSnapshot: coverage.studentsWithSnapshot,
                totalStudents: coverage.totalStudents,
                pendingCreate: coverage.pendingCreate,
                pendingFill: coverage.pendingFill,
                complete: coverage.complete,
            }
            : null,
        periodClose: periodCloseResult
            ? {
                closedAcademicYearId: periodCloseResult.closedAcademicYearId,
                closedAcademicYearIds: periodCloseResult.closedAcademicYearIds,
                counts: periodCloseResult.counts,
                runs: periodCloseResult.runs,
            }
            : null,
    };
}
