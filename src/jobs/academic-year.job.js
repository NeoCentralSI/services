import prisma from "../config/prisma.js";
import {
    formatAcademicYearLabel,
    syncAcademicYearActiveFlags,
} from "../helpers/academicYear.helper.js";
import { ROLES } from "../constants/roles.js";
import { createNotificationEventForUsers } from "../services/notification.service.js";

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

        const kadepRows = await prisma.userHasRole.findMany({
            where: {
                status: "active",
                role: { name: ROLES.KETUA_DEPARTEMEN },
            },
            select: { userId: true },
        });
        const kadepUserIds = kadepRows.map((row) => row.userId);
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

    return {
        synced: true,
        changed,
        previousAcademicYearId: previousActive?.id ?? null,
        activeAcademicYearId: currentActive.id,
        updatedFlags: result.updated,
    };
}
