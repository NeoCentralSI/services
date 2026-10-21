import prisma from "../config/prisma.js";
import {
    formatAcademicYearLabel,
    syncAcademicYearActiveFlags,
} from "../helpers/academicYear.helper.js";
import { ROLES } from "../constants/roles.js";
import { createNotificationEventForUsers } from "../services/notification.service.js";
import { getPeriodFlagCoverage } from "../services/research-method/eligibility.service.js";

async function findActiveUserIdsByRole(roleName) {
    const rows = await prisma.userHasRole.findMany({
        where: { status: "active", role: { name: roleName } },
        select: { userId: true },
    });
    return rows.map((row) => row.userId);
}

/**
 * Report how many students already have SIA flags for the new period. It never blocks the
 * switch; when flags are missing, Admin is asked to run the SIA sync, because eligibility for
 * a supervisor request reads the Metode Penelitian flag.
 */
async function reportPeriodFlagCoverage(academicYear, { notify }) {
    let coverage = null;
    try {
        coverage = await getPeriodFlagCoverage(academicYear.id);
    } catch (coverageError) {
        console.error(
            "[AcademicYear Sync] Gagal memeriksa penanda SIA periode:",
            coverageError?.message ?? coverageError,
        );
        return null;
    }
    if (!coverage || coverage.studentsWithoutFlags === 0) return coverage;

    console.warn(
        `[AcademicYear Sync] Penanda SIA ${formatAcademicYearLabel(academicYear)}: ` +
        `${coverage.studentsWithFlags} dari ${coverage.totalStudents} mahasiswa.`,
    );
    if (!notify) return coverage;

    try {
        const adminUserIds = await findActiveUserIdsByRole(ROLES.ADMIN);
        if (adminUserIds.length === 0) return coverage;
        await createNotificationEventForUsers(
            adminUserIds,
            {
                title: "Data SIA Periode Baru Belum Lengkap",
                message:
                    `Periode ${formatAcademicYearLabel(academicYear)} baru memiliki data SIA untuk ` +
                    `${coverage.studentsWithFlags} dari ${coverage.totalStudents} mahasiswa. Jalankan sinkronisasi SIA ` +
                    "agar kelayakan Metode Penelitian terbaca.",
                type: "simpta_period_snapshot_incomplete",
                data: {
                    academicYearId: academicYear.id,
                    studentsWithFlags: coverage.studentsWithFlags,
                    totalStudents: coverage.totalStudents,
                },
            },
            { push: true },
        );
    } catch (notificationError) {
        console.error(
            "[AcademicYear Sync] Peringatan data SIA gagal dikirim ke Admin:",
            notificationError?.message ?? notificationError,
        );
    }
    return coverage;
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
                            `Tinjau Penetapan Pembimbing ${formatAcademicYearLabel(previousActive)} bila masih ada mahasiswa yang belum ditetapkan.`,
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

    const coverage = await reportPeriodFlagCoverage(currentActive, {
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
                studentsWithFlags: coverage.studentsWithFlags,
                totalStudents: coverage.totalStudents,
                complete: coverage.studentsWithoutFlags === 0,
            }
            : null,
    };
}
