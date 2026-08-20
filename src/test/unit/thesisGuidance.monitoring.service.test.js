import { beforeEach, describe, expect, it, vi } from "vitest";

const repoMock = {
  getStatusDistribution: vi.fn(),
  getRatingDistribution: vi.fn(),
  getProgressStatistics: vi.fn(),
  getAtRiskStudents: vi.fn(),
  getSlowStudents: vi.fn(),
  getStudentsReadyForSeminar: vi.fn(),
  getTopicDistribution: vi.fn(),
  getBatchDistribution: vi.fn(),
  getProgressDistribution: vi.fn(),
  getGuidanceTrend: vi.fn(),
  getSupervisorWorkloadRows: vi.fn(),
  getAcademicYearById: vi.fn(),
};

vi.mock("../../config/prisma.js", () => ({ default: {} }));
vi.mock("../../services/push.service.js", () => ({ sendFcmToUsers: vi.fn() }));
vi.mock("../../services/notification.service.js", () => ({ createNotificationsForUsers: vi.fn() }));
vi.mock("../../utils/simptaThesisStatus.util.js", () => ({
  buildTa03Snapshot: vi.fn(),
  buildTa04Snapshot: vi.fn(),
  deriveSimptaThesisStatus: vi.fn(),
}));
vi.mock("../../repositories/thesisGuidance/monitoring.repository.js", () => repoMock);

const monitoringService = await import("../../services/thesisGuidance/monitoring.service.js");
const { SUPERVISOR_LOAD_DEFINITION_LABEL } = await import("../../utils/loadScope.util.js");

describe("thesisGuidance monitoring load labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.getAcademicYearById.mockResolvedValue({
      id: "ay-1",
      year: "2025/2026",
      semester: "ganjil",
    });
    repoMock.getSupervisorWorkloadRows.mockResolvedValue([
      {
        lecturerId: "lec-1",
        role: { name: "Pembimbing 1" },
        lecturer: {
          user: { fullName: "Dosen A", identityNumber: "1", email: "a@x" },
        },
        thesis: {
          id: "t-1",
          title: "Judul",
          student: { user: { fullName: "Mhs", identityNumber: "221", email: "m@x" } },
        },
      },
    ]);
    repoMock.getStatusDistribution.mockResolvedValue([]);
    repoMock.getRatingDistribution.mockResolvedValue([]);
    repoMock.getProgressStatistics.mockResolvedValue({
      totalActiveTheses: 22,
      totalProposalTheses: 21,
      totalPostProposalTheses: 5,
      totalMilestones: 0,
      completedMilestones: 0,
      averageProgress: 0,
      studentsComplete100: 0,
      studentsWithNoProgress: 0,
    });
    repoMock.getAtRiskStudents.mockResolvedValue([]);
    repoMock.getSlowStudents.mockResolvedValue([]);
    repoMock.getStudentsReadyForSeminar.mockResolvedValue([]);
    repoMock.getTopicDistribution.mockResolvedValue([]);
    repoMock.getBatchDistribution.mockResolvedValue([]);
    repoMock.getProgressDistribution.mockResolvedValue([]);
    repoMock.getGuidanceTrend.mockResolvedValue([]);
  });

  it("keeps post-proposal semantics and labels supervisor-loads", async () => {
    const result = await monitoringService.getSupervisorWorkloads("ay-1");
    expect(result.definitionLabel).toBe(SUPERVISOR_LOAD_DEFINITION_LABEL);
    expect(result.periodLabel).toMatch(/Ganjil/);
    expect(result.uniqueThesisCount).toBe(1);
    expect(result.lecturers).toHaveLength(1);
    expect(result.lecturers[0].studentCount).toBe(1);
  });

  it("does not present mixed-phase summary totals as supervisor-load counts", async () => {
    const dashboard = await monitoringService.getMonitoringDashboard("ay-1");
    expect(dashboard.summary.totalActiveTheses).toBe(22);
    expect(dashboard.summary.supervisorLoadThesisCount).toBe(1);
    expect(dashboard.summary.totalPostProposalTheses).toBe(1);
    expect(dashboard.supervisorLoads.uniqueThesisCount).toBe(1);
    expect(dashboard.summary.periodLabel).toBe(dashboard.supervisorLoads.periodLabel);
  });
});
