import prisma from "../../config/prisma.js";
import { OPEN_THESIS_STATUSES } from "../../constants/thesisStatus.js";

/** The thesis a student's Proposal page is about: the open one, else the latest. */
export function findStudentThesis(studentId, client = prisma) {
  const select = {
    id: true,
    title: true,
    status: true,
    startDate: true,
    supervisorAssignedAt: true,
    academicYear: { select: { id: true, semester: true, year: true } },
    thesisTopic: { select: { id: true, name: true } },
    thesisSupervisors: {
      where: { status: "active" },
      select: { lecturerId: true, role: { select: { name: true } }, lecturer: { select: { user: { select: { fullName: true, identityNumber: true } } } } },
    },
  };
  return client.thesis
    .findFirst({ where: { studentId, status: { in: OPEN_THESIS_STATUSES } }, select, orderBy: { createdAt: "desc" } })
    .then((open) => open ?? client.thesis.findFirst({ where: { studentId }, select, orderBy: { createdAt: "desc" } }));
}

