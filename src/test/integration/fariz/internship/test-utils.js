import jwt from "jsonwebtoken";
import { ENV } from "../../../config/env.js";
import prisma from "../../../../config/prisma.js";

export function makeAuthToken(user, claims = {}) {
  return jwt.sign({ sub: user.id, email: user.email, ...claims }, ENV.JWT_SECRET);
}

export async function getUserByEmailOrThrow(email, include = {}) {
  const user = await prisma.user.findFirst({
    where: { email },
    include,
  });

  if (!user) {
    throw new Error(`User (${email}) not found.`);
  }

  return user;
}

export async function ensureDocumentType(name) {
  const existing = await prisma.documentType.findFirst({ where: { name } });
  if (existing) return existing;

  return prisma.documentType.create({ data: { name } });
}

export async function createTestDocument(userId, fileName = `test-${Date.now()}.pdf`) {
  const documentType = await ensureDocumentType("Proposal Internship");

  return prisma.document.create({
    data: {
      userId,
      documentTypeId: documentType.id,
      fileName,
      filePath: `uploads/test/${fileName}`,
    },
  });
}

export async function ensureActiveAcademicYear() {
  const active = await prisma.academicYear.findFirst({ where: { isActive: true } });
  if (active) return active;

  const latest = await prisma.academicYear.findFirst({ orderBy: { createdAt: "desc" } });
  if (latest) return latest;

  return prisma.academicYear.create({
    data: {
      year: "2025/2026",
      semester: "ganjil",
      isActive: true,
    },
  });
}

export async function ensureCompany(overrides = {}) {
  const companyName = overrides.companyName || "PT Integration Test";
  const companyAddress = overrides.companyAddress || "Jl. Integration Test No. 1";

  const existing = await prisma.company.findFirst({ where: { companyName } });
  if (existing) return existing;

  return prisma.company.create({
    data: {
      companyName,
      companyAddress,
      alasan: overrides.alasan || "Integration test fixture",
      status: overrides.status || "save",
    },
  });
}

export async function createOngoingInternship({
  studentUser,
  supervisorUser = null,
  actualStartDate = new Date(),
  actualEndDate = null,
  status = "ONGOING",
  companyName,
} = {}) {
  const studentId = studentUser.student?.id || studentUser.id;
  const supervisorId = supervisorUser?.lecturer?.id || supervisorUser?.id || null;
  const academicYear = await ensureActiveAcademicYear();
  const company = await ensureCompany({ companyName });
  const document = await createTestDocument(studentUser.id);
  const endDate = actualEndDate || new Date(new Date(actualStartDate).getTime() + 60 * 24 * 60 * 60 * 1000);

  const proposal = await prisma.internshipProposal.create({
    data: {
      coordinatorId: studentId,
      proposalDocumentId: document.id,
      academicYearId: academicYear.id,
      targetCompanyId: company.id,
      proposedStartDate: actualStartDate,
      proposedEndDate: endDate,
      startDateActual: actualStartDate,
      endDateActual: endDate,
      status: "ACCEPTED_BY_COMPANY",
    },
  });

  return prisma.internship.create({
    data: {
      studentId,
      proposalId: proposal.id,
      supervisorId,
      status,
      actualStartDate,
      actualEndDate: endDate,
    },
  });
}

export function nextWeekdayDateString(daysFromNow = 14) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  while ([0, 6].includes(date.getDay())) {
    date.setDate(date.getDate() + 1);
  }
  return date.toISOString().slice(0, 10);
}
