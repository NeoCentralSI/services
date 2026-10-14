import prisma from "../config/prisma.js";

/**
 * Find student's thesis with metopen-phase milestones
 */
export async function findStudentThesis(userId) {
  const student = await prisma.student.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!student) return null;

  return prisma.thesis.findFirst({
    where: { studentId: student.id },
    select: {
      id: true,
      studentId: true,
      title: true,
      proposalStatus: true,
      academicYearId: true,
      ta04AssignmentAcademicYearId: true,
      status: true,
    },
    orderBy: { createdAt: "desc" },
  });
}