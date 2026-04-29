import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import prisma from "../../../config/prisma.js";
import { updateAllInternshipDeadlineStatuses } from "../../../services/insternship/internshipStatus.service.js";

describe("Internship Cron Job Integration Test", () => {
  let testStudent;
  let testProposal;
  let testDocument;

  beforeAll(async () => {
    console.log("🔍 [SETUP] Initializing internship cron test data...");
    
    // Find a student
    testStudent = await prisma.student.findFirst({
      include: { user: true }
    });

    if (!testStudent) throw new Error("No student found for test.");

    // Cleanup previous data
    await prisma.internship.deleteMany({ where: { studentId: testStudent.id } });
    await prisma.internshipProposal.deleteMany({ where: { coordinatorId: testStudent.id } });

    // Create a dummy document
    testDocument = await prisma.document.create({
      data: {
        fileName: "test.pdf",
        filePath: "uploads/test.pdf",
        userId: testStudent.id
      }
    });

    // Find academic year and company
    const academicYear = await prisma.academicYear.findFirst({ orderBy: { year: 'desc' } });
    const company = await prisma.company.findFirst();
    
    if (!academicYear || !company) throw new Error("AcademicYear or Company not found for test.");

    // Create a dummy proposal
    testProposal = await prisma.internshipProposal.create({
      data: {
        coordinatorId: testStudent.id,
        proposalDocumentId: testDocument.id,
        academicYearId: academicYear.id,
        targetCompanyId: company.id,
        proposedStartDate: new Date(),
        proposedEndDate: new Date(),
        status: 'ACCEPTED_BY_COMPANY'
      }
    });
  });

  beforeEach(async () => {
    // Cleanup between tests to prevent unique constraint violations (1 internship per proposal)
    await prisma.internship.deleteMany({ where: { studentId: testStudent.id } });
  });

  // Helper to create a test internship
  async function createTestInternship(endDate, hasReport = false) {
    return await prisma.internship.create({
      data: {
        studentId: testStudent.id,
        proposalId: testProposal.id,
        status: 'ONGOING',
        actualStartDate: new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000),
        actualEndDate: endDate,
        reportDocumentId: hasReport ? testDocument.id : null,
      }
    });
  }

  it("Scenario 1: Should remain ONGOING if within 1 month after end date", async () => {
    console.log("🚀 [SCENARIO 1] Within deadline...");
    const recentlyEnded = new Date();
    recentlyEnded.setDate(recentlyEnded.getDate() - 7); // Ended 7 days ago

    const internship = await createTestInternship(recentlyEnded);

    const result = await updateAllInternshipDeadlineStatuses();
    
    const updated = await prisma.internship.findUnique({ where: { id: internship.id } });
    expect(updated.status).toBe('ONGOING');
    console.log(`✅ [SCENARIO 1] Status remains ONGOING (Processed: ${result.processed})`);
  });

  it("Scenario 2: Should change to FAILED if past 1 month and no report uploaded", async () => {
    console.log("🚀 [SCENARIO 2] Past reporting deadline...");
    const longAgo = new Date();
    longAgo.setMonth(longAgo.getMonth() - 1);
    longAgo.setDate(longAgo.getDate() - 5); // Ended 1 month and 5 days ago

    const internship = await createTestInternship(longAgo, false);

    const result = await updateAllInternshipDeadlineStatuses();
    
    const updated = await prisma.internship.findUnique({ where: { id: internship.id } });
    expect(updated.status).toBe('FAILED');
    console.log(`✅ [SCENARIO 2] Status changed to FAILED due to reporting deadline.`);
  });

  it("Scenario 3: Should change to FAILED if past 2 months and no completed seminar", async () => {
    console.log("🚀 [SCENARIO 3] Past seminar deadline...");
    const veryLongAgo = new Date();
    veryLongAgo.setMonth(veryLongAgo.getMonth() - 2);
    veryLongAgo.setDate(veryLongAgo.getDate() - 5); // Ended 2 months and 5 days ago

    // Even if report exists, if no seminar after 2 months -> FAILED
    const internship = await createTestInternship(veryLongAgo, true);

    const result = await updateAllInternshipDeadlineStatuses();
    
    const updated = await prisma.internship.findUnique({ where: { id: internship.id } });
    expect(updated.status).toBe('FAILED');
    console.log(`✅ [SCENARIO 3] Status changed to FAILED due to seminar deadline.`);
  });

  it("Scenario 4: Should NOT touch COMPLETED internships", async () => {
    console.log("🚀 [SCENARIO 4] Skipping COMPLETED status...");
    const longAgo = new Date();
    longAgo.setMonth(longAgo.getMonth() - 3);

    const internship = await prisma.internship.create({
      data: {
        studentId: testStudent.id,
        proposalId: testProposal.id,
        status: 'COMPLETED',
        actualEndDate: longAgo
      }
    });

    await updateAllInternshipDeadlineStatuses();
    
    const updated = await prisma.internship.findUnique({ where: { id: internship.id } });
    expect(updated.status).toBe('COMPLETED');
    console.log(`✅ [SCENARIO 4] COMPLETED status remained unchanged.`);
  });
});
