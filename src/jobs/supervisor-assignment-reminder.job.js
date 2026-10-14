import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";
import { formatAcademicYearLabel } from "../helpers/academicYear.helper.js";
import { createNotificationEventForUsers } from "../services/notification.service.js";
import {
  findActiveUserIdsByRole,
  findPeriodsWaitingForAssignment,
} from "../services/thesis-proposal/supervisor-assignment.service.js";

const REMINDER_TYPE = "supervisor_assignment_reminder";
const DAY = 24 * 60 * 60 * 1000;

/**
 * Daily nudge to the Head of Department while accepted requests of a period are not yet in a
 * Penetapan Pembimbing (renamed from the old TA-04 batch reminder, now scheduled). At most once
 * per 24 hours per period.
 */
export async function runSupervisorAssignmentReminderJob(now = new Date()) {
  const periods = await findPeriodsWaitingForAssignment();
  const kadepIds = await findActiveUserIdsByRole(ROLES.KETUA_DEPARTEMEN);
  let reminded = 0;
  let skipped = 0;
  for (const period of periods) {
    if (kadepIds.length === 0) break;
    const recent = await prisma.notification.findFirst({
      where: {
        userId: { in: kadepIds },
        type: REMINDER_TYPE,
        createdAt: { gte: new Date(now.getTime() - DAY) },
        data: { path: "$.academicYearId", equals: period.academicYearId },
      },
      select: { id: true },
    });
    if (recent) {
      skipped += 1;
      continue;
    }
    const year = await prisma.academicYear.findUnique({ where: { id: period.academicYearId } });
    await createNotificationEventForUsers(
      kadepIds,
      {
        title: "Penetapan Pembimbing Menunggu",
        message: `${period.waiting} mahasiswa ${formatAcademicYearLabel(year)} sudah disetujui pembimbingnya tetapi belum masuk Penetapan Pembimbing.`,
        type: REMINDER_TYPE,
        data: { academicYearId: period.academicYearId, route: "/kelola/tugas-akhir/kadep/penetapan-pembimbing?tab=penetapan" },
      },
      { push: true },
    );
    reminded += 1;
  }
  console.log(`[supervisor-assignment-reminder] periode ${periods.length}, diingatkan ${reminded}, dilewati ${skipped}`);
  return { total: periods.length, reminded, skipped };
}
