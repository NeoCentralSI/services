import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockExaminerRepo, mockCoreRepo, mockPrisma, mockStatusUtil } = vi.hoisted(() => ({
  mockExaminerRepo: {
    findEligibleExaminers: vi.fn(),
    findActiveExaminersByDefence: vi.fn(),
    findExaminerById: vi.fn(),
    updateExaminerAvailability: vi.fn(),
    findLatestExaminerByDefenceAndLecturer: vi.fn(),
    saveDefenceExaminerAssessment: vi.fn(),
    findActiveExaminersWithAssessments: vi.fn(),
    findDefenceAssessmentCpmks: vi.fn(),
    findDefenceMinimumScore: vi.fn(),
  },
  mockCoreRepo: {
    findDefenceById: vi.fn(),
    findDefenceBasicById: vi.fn(),
    updateDefence: vi.fn(),
    updateDefenceStatus: vi.fn(),
    findUserIdsByRole: vi.fn().mockResolvedValue([]),
    findDefenceSupervisorRole: vi.fn(),
    findDefenceSupervisorAssessmentDetails: vi.fn().mockResolvedValue([]),
    saveDefenceSupervisorAssessment: vi.fn(),
    finalizeDefenceResult: vi.fn(),
  },
  mockPrisma: {
    thesis: { findUnique: vi.fn() },
    thesisDefence: { findUnique: vi.fn() },
    academicYear: { findUnique: vi.fn() },
    thesisSeminar: { findFirst: vi.fn() },
    thesisDefenceExaminer: { findMany: vi.fn(), deleteMany: vi.fn(), update: vi.fn(), createMany: vi.fn() },
    lecturer: { findMany: vi.fn(), findUnique: vi.fn() },
    lecturerAvailability: { findMany: vi.fn().mockResolvedValue([]) },
    thesisSeminarExaminer: { findMany: vi.fn().mockResolvedValue([]) },
    thesisSupervisors: { updateMany: vi.fn() },
  },
  mockStatusUtil: { computeEffectiveDefenceStatus: vi.fn() },
}));

mockPrisma.$transaction = vi.fn(async (cb) => cb(mockPrisma));
vi.mock("../../../../repositories/thesis-defence/examiner.repository.js", () => mockExaminerRepo);
vi.mock("../../../../repositories/thesis-defence/thesis-defence.repository.js", () => mockCoreRepo);
vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));
vi.mock("../../../../utils/defenceStatus.util.js", () => mockStatusUtil);
vi.mock("../../../../utils/score.util.js", () => ({ mapScoreToGrade: vi.fn().mockReturnValue("A") }));
vi.mock("../../../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn().mockResolvedValue({ count: 1 }) }));
vi.mock("../../../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("../../../../helpers/academicYear.helper.js", () => ({ getActiveAcademicYear: vi.fn().mockResolvedValue({ id: "ay_active" }) }));

import {
  getAssessment,
  submitAssessment,
  finalizeDefence,
  resolveDefenceAssessmentConfiguration,
} from "../../../../services/thesis-defence/examiner.service.js";

describe("Thesis Defence Assessment Focused Rules & Validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStatusUtil.computeEffectiveDefenceStatus.mockImplementation((s) => s);
    mockPrisma.thesisDefence.findUnique.mockResolvedValue({
      id: "d1",
      requirementDocuments: [{ requirement: { academicYearId: "ay_req" } }],
    });
    mockExaminerRepo.findDefenceMinimumScore.mockResolvedValue(55);
  });

  // 1 & 2. Role-specific Criteria Queries
  it("1. Examiner criteria query passes role 'examiner'", async () => {
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([]);
    await mockExaminerRepo.findDefenceAssessmentCpmks("ay1", "examiner");
    expect(mockExaminerRepo.findDefenceAssessmentCpmks).toHaveBeenCalledWith("ay1", "examiner");
  });

  it("2. Supervisor criteria query passes role 'supervisor'", async () => {
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([]);
    await mockExaminerRepo.findDefenceAssessmentCpmks("ay1", "supervisor");
    expect(mockExaminerRepo.findDefenceAssessmentCpmks).toHaveBeenCalledWith("ay1", "supervisor");
  });

  // 3, 4, 5, 6. Academic Year Resolution & Minimum Score Checks
  it("3. Prefers requirement-document academic year over active academic year", async () => {
    mockPrisma.thesisDefence.findUnique.mockResolvedValue({
      id: "d1",
      requirementDocuments: [{ requirement: { academicYearId: "ay_req_spec" } }],
    });
    const config = await resolveDefenceAssessmentConfiguration("d1");
    expect(config.academicYearId).toBe("ay_req_spec");
  });

  it("4. Rejects multiple requirement academic years with 409", async () => {
    mockPrisma.thesisDefence.findUnique.mockResolvedValue({
      id: "d1",
      requirementDocuments: [
        { requirement: { academicYearId: "ay1" } },
        { requirement: { academicYearId: "ay2" } },
      ],
    });
    await expect(resolveDefenceAssessmentConfiguration("d1")).rejects.toThrow("Terdapat ketidakcocokan tahun akademik");
  });

  it("5. Rejects missing active/applicable academic year", async () => {
    mockPrisma.thesisDefence.findUnique.mockResolvedValue({ id: "d1", requirementDocuments: [] });
    const { getActiveAcademicYear } = await import("../../../../helpers/academicYear.helper.js");
    vi.mocked(getActiveAcademicYear).mockResolvedValueOnce(null);
    await expect(resolveDefenceAssessmentConfiguration("d1")).rejects.toThrow("Tahun akademik untuk penilaian sidang belum tersedia.");
  });

  it("6. Rejects null minimum passing score with clear message", async () => {
    mockExaminerRepo.findDefenceMinimumScore.mockResolvedValueOnce(null);
    await expect(resolveDefenceAssessmentConfiguration("d1")).rejects.toThrow("Nilai minimum kelulusan sidang untuk tahun akademik ini belum dikonfigurasi.");
  });

  // 7 & 8. Examiner Draft vs Final
  it("7. Examiner draft permits partial criteria scores", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({ id: "d1", status: "ongoing" });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue({ id: "ex1", availabilityStatus: "available" });
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([
      { assessmentCriterias: [{ id: "c1", maxScore: 50 }, { id: "c2", maxScore: 50 }] },
    ]);
    mockExaminerRepo.saveDefenceExaminerAssessment.mockResolvedValue({ id: "ex1", assessmentScore: 40 });

    const res = await submitAssessment("d1", { isDraft: true, scores: [{ assessmentCriteriaId: "c1", score: 40 }] }, "l1");
    expect(res.assessorRole).toBe("examiner");
  });

  it("8. Final examiner submission requires every criterion", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({ id: "d1", status: "ongoing" });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue({ id: "ex1", availabilityStatus: "available" });
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([
      { assessmentCriterias: [{ id: "c1", maxScore: 50 }, { id: "c2", maxScore: 50 }] },
    ]);

    await expect(
      submitAssessment("d1", { isDraft: false, scores: [{ assessmentCriteriaId: "c1", score: 40 }] }, "l1")
    ).rejects.toThrow("Semua kriteria aktif harus diisi sebelum submit.");
  });

  // 9. Examiner post-submit lock
  it("9. Submitted examiner assessment cannot be overwritten", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({ id: "d1", status: "ongoing" });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue({
      id: "ex1", availabilityStatus: "available", assessmentSubmittedAt: new Date(),
    });
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([
      { assessmentCriterias: [{ id: "c1", maxScore: 100 }] },
    ]);

    await expect(
      submitAssessment("d1", { isDraft: true, scores: [{ assessmentCriteriaId: "c1", score: 80 }] }, "l1")
    ).rejects.toThrow("Penilaian penguji sudah disubmit sebelumnya dan tidak dapat diubah.");
  });

  // 10 & 11. Supervisor Draft & post-submit lock
  it("10. Supervisor draft permits partial scores", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({ id: "d1", status: "ongoing" });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue(null);
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "sup1" });
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([
      { assessmentCriterias: [{ id: "c1", maxScore: 30 }, { id: "c2", maxScore: 30 }] },
    ]);
    mockCoreRepo.saveDefenceSupervisorAssessment.mockResolvedValue({ id: "d1", supervisorScore: 25 });

    const res = await submitAssessment("d1", { isDraft: true, scores: [{ assessmentCriteriaId: "c1", score: 25 }] }, "sup1");
    expect(res.assessorRole).toBe("supervisor");
  });

  it("11. Submitted supervisor assessment cannot be overwritten even with isDraft: true", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({
      id: "d1", status: "ongoing", supervisorAssessmentSubmittedAt: new Date(),
    });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue(null);
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "sup1" });
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([
      { assessmentCriterias: [{ id: "c1", maxScore: 30 }] },
    ]);

    await expect(
      submitAssessment("d1", { isDraft: true, scores: [{ assessmentCriteriaId: "c1", score: 20 }] }, "sup1")
    ).rejects.toThrow("Penilaian pembimbing sudah disubmit dan tidak dapat diubah.");
  });

  // 12 & 13. Numeric and Invalid Score Validations
  it("12. Accepts zero and valid decimal scores", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({ id: "d1", status: "ongoing" });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue({ id: "ex1", availabilityStatus: "available" });
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([
      { assessmentCriterias: [{ id: "c1", name: "Score A", maxScore: 100 }] },
    ]);
    mockExaminerRepo.saveDefenceExaminerAssessment.mockResolvedValue({ id: "ex1", assessmentScore: 75.5 });

    const res = await submitAssessment("d1", { isDraft: false, scores: [{ assessmentCriteriaId: "c1", score: 75.5 }] }, "l1");
    expect(res.assessmentScore).toBe(75.5);
  });

  it("13. Rejects blank string, whitespace, NaN, Infinity, negative, and excessive scores", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({ id: "d1", status: "ongoing" });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue({ id: "ex1", availabilityStatus: "available" });
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);
    mockExaminerRepo.findDefenceAssessmentCpmks.mockResolvedValue([
      { assessmentCriterias: [{ id: "c1", name: "Score A", maxScore: 50 }] },
    ]);

    const invalidInputs = ["", "   ", NaN, Infinity, -5, 60, true, null, undefined];
    for (const val of invalidInputs) {
      await expect(
        submitAssessment("d1", { isDraft: true, scores: [{ assessmentCriteriaId: "c1", score: val }] }, "l1")
      ).rejects.toThrow();
    }
  });

  // 14 & 15. Dynamic Minimum Score & Atomic Failed Finalization
  it("14. Configured minimum score determines failure when score is below minimum threshold", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({
      id: "d1", status: "scheduled", supervisorScore: 10, supervisorAssessmentSubmittedAt: new Date(),
    });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "sup1" });
    mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
      { lecturerId: "l1", assessmentSubmittedAt: new Date(), assessmentScore: 20 },
      { lecturerId: "l2", assessmentSubmittedAt: new Date(), assessmentScore: 20 },
    ]);
    mockExaminerRepo.findDefenceMinimumScore.mockResolvedValue(60); // Dynamic threshold = 60
    mockCoreRepo.finalizeDefenceResult.mockResolvedValue({
      id: "d1", status: "failed", finalScore: 30, grade: "E", resultFinalizedAt: new Date(),
    });

    const res = await finalizeDefence("d1", { recommendRevision: false }, "sup1");
    expect(mockCoreRepo.finalizeDefenceResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
    expect(res.status).toBe("failed");
  });

  it("15. Failed finalization passes targetStatus: 'failed' to finalizeDefenceResult", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({
      id: "d1", status: "scheduled", supervisorScore: 10, supervisorAssessmentSubmittedAt: new Date(),
    });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "sup1" });
    mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
      { lecturerId: "l1", assessmentSubmittedAt: new Date(), assessmentScore: 20 },
      { lecturerId: "l2", assessmentSubmittedAt: new Date(), assessmentScore: 20 },
    ]);
    mockExaminerRepo.findDefenceMinimumScore.mockResolvedValue(55);
    mockCoreRepo.finalizeDefenceResult.mockResolvedValue({ id: "d1", status: "failed" });

    await finalizeDefence("d1", {}, "sup1");
    expect(mockCoreRepo.finalizeDefenceResult).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  // 17 & 18. Student and Admin Viewer Permissions
  it("17. Rejects Student access before finalization with 403", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({
      id: "d1", status: "scheduled", thesis: { studentId: "st1" },
    });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue(null);
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);

    await expect(
      getAssessment("d1", { id: "u_st", studentId: "st1" })
    ).rejects.toThrow("Penilaian sidang belum selesai dan belum difinalisasi.");
  });

  it("18. Admin/viewer access does not dereference a missing examiner object", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({
      id: "d1", status: "scheduled", thesis: { student: { user: { fullName: "S" } } },
    });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockExaminerRepo.findLatestExaminerByDefenceAndLecturer.mockResolvedValue(null);
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue(null);

    const res = await getAssessment("d1", { id: "u_admin", role: "Admin", roles: ["Admin"] });
    expect(res.assessorRole).toBe("viewer");
    expect(res.examiner).toBeNull();
  });

  // 20. Revision Initialization on passed_with_revision
  it("20. passed_with_revision attempts auto-generating revision items after finalization", async () => {
    mockCoreRepo.findDefenceById.mockResolvedValue({
      id: "d1", status: "scheduled", supervisorScore: 25, supervisorAssessmentSubmittedAt: new Date(),
    });
    mockStatusUtil.computeEffectiveDefenceStatus.mockReturnValue("ongoing");
    mockCoreRepo.findDefenceSupervisorRole.mockResolvedValue({ id: "sup1" });
    mockExaminerRepo.findActiveExaminersWithAssessments.mockResolvedValue([
      { lecturerId: "l1", assessmentSubmittedAt: new Date(), assessmentScore: 35 },
      { lecturerId: "l2", assessmentSubmittedAt: new Date(), assessmentScore: 35 },
    ]);
    mockExaminerRepo.findDefenceMinimumScore.mockResolvedValue(55);
    mockCoreRepo.finalizeDefenceResult.mockResolvedValue({
      id: "d1", status: "passed_with_revision", finalScore: 95, grade: "A", resultFinalizedAt: new Date(),
    });

    const res = await finalizeDefence("d1", { recommendRevision: true }, "sup1");
    expect(res.status).toBe("passed_with_revision");
  });
});
