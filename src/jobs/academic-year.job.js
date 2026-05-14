import prisma from "../config/prisma.js";
import { finalizeBatchTA04 } from "../services/advisorRequest.service.js";

export async function syncActiveAcademicYear() {
    try {
        const now = new Date();
        // Convert to WIB
        const wibOffset = 7 * 60;
        const nowWIB = new Date(now.getTime() + (wibOffset + now.getTimezoneOffset()) * 60 * 1000);

        const academicYears = await prisma.academicYear.findMany();

        // Find which one SHOULD be active
        const shouldBeActive = academicYears.find(ay => {
            if (!ay.startDate || !ay.endDate) return false;
            const endDate = new Date(ay.endDate);
            endDate.setHours(23, 59, 59, 999);
            return nowWIB >= new Date(ay.startDate) && nowWIB <= endDate;
        });

        const currentActive = academicYears.filter(ay => ay.isActive);
        const previousActive = currentActive.length === 1 ? currentActive[0] : null;

        // If there is one that should be active and it's not the ONLY active one, sync it
        if (shouldBeActive) {
            // Are there multiple active ones, or is the current active one incorrect?
            const needsSync = !shouldBeActive.isActive || currentActive.length !== 1 || currentActive[0].id !== shouldBeActive.id;

            if (needsSync) {
                console.log(`[AcademicYear Sync] Switching active academic year to: ${shouldBeActive.semester} ${shouldBeActive.year}`);

                // Transaction: set all to inactive, then set the correct one to active
                await prisma.$transaction([
                    prisma.academicYear.updateMany({
                        data: { isActive: false },
                    }),
                    prisma.academicYear.update({
                        where: { id: shouldBeActive.id },
                        data: { isActive: true },
                    }),
                ]);

                // Finalize TA-04 for the previous academic year when the active semester rolls over.
                if (previousActive && previousActive.id !== shouldBeActive.id) {
                    try {
                        const result = await finalizeBatchTA04(previousActive.id);
                        const status = result.alreadyFinalized ? "already finalized" : "finalized";
                        console.log(`[AcademicYear Sync] TA-04 batch ${status} for previous semester: ${previousActive.semester} ${previousActive.year}`);
                    } catch (ta04Error) {
                        console.error("[AcademicYear Sync] Failed finalizing previous semester TA-04 batch:", ta04Error.message);
                    }
                }
            }
        } else {
            // Nothing should be active? Turn them all off if any are on
            if (currentActive.length > 0) {
                console.log(`[AcademicYear Sync] No academic year is currently active by date. Setting all to inactive.`);
                await prisma.academicYear.updateMany({
                    data: { isActive: false },
                });
            }
        }
    } catch (error) {
        console.error("[AcademicYear Sync] Failed:", error);
    }
}
