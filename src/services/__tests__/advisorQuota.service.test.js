import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/advisorQuota.repository.js", () => ({
  findActiveAcademicYear: vi.fn(),
  findQuotaLecturerMetadata: vi.fn(),
  findTrackedAdvisorRequests: vi.fn(),
  findTrackedSupervisorAssignments: vi.fn(),
  ensureLecturerQuotaRow: vi.fn(),
  lockLecturerQuotaRow: vi.fn(),
  updateLecturerQuotaCurrentCount: vi.fn(),
}));

import * as repo from "../../repositories/advisorQuota.repository.js";
import { ADVISOR_REQUEST_STATUS } from "../../constants/advisorRequestStatus.js";
import {
  getLecturerQuotaSnapshots,
  getLecturerQuotaSnapshot,
  syncLecturerQuotaCurrentCount,
} from "../advisorQuota.service.js";

function createLecturer({ lecturerId = "lecturer-1", quotaMax = 10, quotaSoftLimit = 8 } = {}) {
  return {
    id: lecturerId,
    acceptingRequests: true,
    user: {
      fullName: "Dr. Dosen",
      identityNumber: "19800101",
      email: "lecturer@example.com",
      avatarUrl: null,
    },
    scienceGroup: null,
    supervisionQuotas: [
      {
        id: `quota-${lecturerId}`,
        quotaMax,
        quotaSoftLimit,
        currentCount: 0,
      },
    ],
  };
}

function createRequest({
  id,
  lecturerId = "lecturer-1",
  studentId,
  thesisId,
  status,
  academicYearId = "ay-1",
  proposalStatus = null,
  thesisStatusName = "Metopel",
  thesisTitle,
  redirectedTo = null,
  routeType = "normal",
} = {}) {
  return {
    id,
    lecturerId,
    redirectedTo,
    studentId,
    thesisId,
    academicYearId,
    status,
    routeType,
    proposedTitle: `Judul ${id}`,
    lecturerApprovalNote: null,
    rejectionReason: null,
    justificationText: null,
    kadepNotes: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    lecturerRespondedAt: null,
    reviewedAt: null,
    student: {
      id: studentId,
      user: {
        fullName: `Mahasiswa ${studentId}`,
        identityNumber: studentId,
        avatarUrl: null,
      },
    },
    lecturer: {
      id: lecturerId,
      user: {
        fullName: "Dr. Dosen",
        identityNumber: "19800101",
      },
    },
    topic: null,
    thesis: thesisId
      ? {
          id: thesisId,
          title: thesisTitle ?? `Thesis ${thesisId}`,
          proposalStatus,
          thesisStatus: { name: thesisStatusName },
          studentId,
        }
      : null,
  };
}

function createSupervisor({
  id,
  lecturerId = "lecturer-1",
  studentId,
  thesisId,
  proposalStatus = null,
  thesisStatusName = "Metopel",
  thesisTitle,
} = {}) {
  return {
    id,
    lecturerId,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    role: { id: "role-p1", name: "Pembimbing 1" },
    thesis: {
      id: thesisId,
      title: thesisTitle ?? `Thesis ${thesisId}`,
      proposalStatus,
      thesisStatus: { name: thesisStatusName },
      studentId,
      student: {
        id: studentId,
        user: {
          fullName: `Mahasiswa ${studentId}`,
          identityNumber: studentId,
          avatarUrl: null,
        },
      },
    },
  };
}

describe("advisorQuota.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findActiveAcademicYear.mockResolvedValue({ id: "ay-1" });
    repo.findQuotaLecturerMetadata.mockResolvedValue([createLecturer()]);
    repo.findTrackedAdvisorRequests.mockResolvedValue([]);
    repo.findTrackedSupervisorAssignments.mockResolvedValue([]);
    repo.ensureLecturerQuotaRow.mockResolvedValue({ id: "quota-lecturer-1" });
    repo.lockLecturerQuotaRow.mockResolvedValue({ id: "quota-lecturer-1" });
    repo.updateLecturerQuotaCurrentCount.mockResolvedValue({
      id: "quota-lecturer-1",
      lecturerId: "lecturer-1",
      academicYearId: "ay-1",
      currentCount: 0,
    });
  });

  it("computes normal availability from active official load", async () => {
    repo.findTrackedAdvisorRequests.mockResolvedValue(
      Array.from({ length: 9 }, (_, index) =>
        createRequest({
          id: `req-active-${index + 1}`,
          studentId: `student-${index + 1}`,
          thesisId: `thesis-${index + 1}`,
          status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
          proposalStatus: "accepted",
        }),
      ),
    );

    const snapshot = await getLecturerQuotaSnapshot("lecturer-1", "ay-1");

    expect(snapshot.activeCount).toBe(9);
    expect(snapshot.bookingCount).toBe(0);
    expect(snapshot.pendingKadepCount).toBe(0);
    expect(snapshot.currentCount).toBe(9);
    expect(snapshot.normalAvailable).toBe(1);
    expect(snapshot.overquotaAmount).toBe(0);
  });

  it("does not count pending KaDep as booking, but keeps it visible separately", async () => {
    repo.findTrackedAdvisorRequests.mockResolvedValue([
      ...Array.from({ length: 9 }, (_, index) =>
        createRequest({
          id: `req-active-${index + 1}`,
          studentId: `student-a-${index + 1}`,
          thesisId: `thesis-a-${index + 1}`,
          status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
          proposalStatus: "accepted",
        }),
      ),
      createRequest({
        id: "req-booking-1",
        studentId: "student-booking-1",
        thesisId: "thesis-booking-1",
        status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
      }),
      createRequest({
        id: "req-pending-kadep-1",
        studentId: "student-pending-1",
        thesisId: "thesis-pending-1",
        status: ADVISOR_REQUEST_STATUS.PENDING_KADEP,
      }),
    ]);

    const snapshot = await getLecturerQuotaSnapshot("lecturer-1", "ay-1");

    expect(snapshot.activeCount).toBe(9);
    expect(snapshot.bookingCount).toBe(1);
    expect(snapshot.pendingKadepCount).toBe(1);
    expect(snapshot.currentCount).toBe(10);
    expect(snapshot.normalAvailable).toBe(0);
    expect(snapshot.overquotaAmount).toBe(0);
  });

  it("keeps unresolved old-semester bookings in quota and reports approved overquota correctly", async () => {
    repo.findTrackedAdvisorRequests.mockResolvedValue([
      ...Array.from({ length: 9 }, (_, index) =>
        createRequest({
          id: `req-active-${index + 1}`,
          studentId: `student-b-${index + 1}`,
          thesisId: `thesis-b-${index + 1}`,
          status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
          proposalStatus: "accepted",
        }),
      ),
      createRequest({
        id: "req-booking-old",
        studentId: "student-old",
        thesisId: "thesis-old",
        status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
        academicYearId: "ay-previous",
      }),
      createRequest({
        id: "req-booking-overquota",
        studentId: "student-overquota",
        thesisId: "thesis-overquota",
        status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
      }),
    ]);

    const snapshot = await getLecturerQuotaSnapshot("lecturer-1", "ay-1");

    expect(snapshot.bookingCount).toBe(2);
    expect(snapshot.currentCount).toBe(11);
    expect(snapshot.normalAvailable).toBe(0);
    expect(snapshot.overquotaAmount).toBe(1);
  });

  it("deduplicates supervisor fallback rows and syncs currentCount from actual active+booking load", async () => {
    repo.findTrackedAdvisorRequests.mockResolvedValue([
      createRequest({
        id: "req-booking-1",
        studentId: "student-1",
        thesisId: "thesis-1",
        status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
      }),
    ]);
    repo.findTrackedSupervisorAssignments.mockResolvedValue([
      createSupervisor({
        id: "sup-1",
        studentId: "student-1",
        thesisId: "thesis-1",
      }),
      createSupervisor({
        id: "sup-2",
        studentId: "student-2",
        thesisId: "thesis-2",
        proposalStatus: "accepted",
      }),
    ]);

    const currentCount = await syncLecturerQuotaCurrentCount("lecturer-1", "ay-1");
    const snapshot = await getLecturerQuotaSnapshot("lecturer-1", "ay-1");

    expect(snapshot.bookingCount).toBe(1);
    expect(snapshot.activeCount).toBe(1);
    expect(snapshot.currentCount).toBe(2);
    expect(currentCount).toBe(2);
    expect(repo.updateLecturerQuotaCurrentCount).toHaveBeenCalledWith(
      undefined,
      "lecturer-1",
      "ay-1",
      2,
    );
  });

  it("normalizes legacy cancelled suffixes from quota entry titles", async () => {
    repo.findTrackedAdvisorRequests.mockResolvedValue([
      createRequest({
        id: "req-active-legacy-title",
        studentId: "student-request-title",
        thesisId: "thesis-request-title",
        status: ADVISOR_REQUEST_STATUS.ACTIVE_OFFICIAL,
        proposalStatus: "accepted",
        thesisTitle: "Pengembangan Platform Manajemen Tugas Akhir (Dibatalkan) (Dibatalkan)",
      }),
    ]);
    repo.findTrackedSupervisorAssignments.mockResolvedValue([
      createSupervisor({
        id: "sup-legacy-title",
        studentId: "student-supervisor-title",
        thesisId: "thesis-supervisor-title",
        proposalStatus: "accepted",
        thesisTitle: "Sistem Informasi Akademik (Dibatalkan)",
      }),
    ]);

    const snapshot = await getLecturerQuotaSnapshot("lecturer-1", "ay-1", { includeEntries: true });

    expect(snapshot.activeOfficialEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          requestId: "req-active-legacy-title",
          thesisTitle: "Pengembangan Platform Manajemen Tugas Akhir",
        }),
        expect.objectContaining({
          supervisorId: "sup-legacy-title",
          thesisTitle: "Sistem Informasi Akademik",
        }),
      ]),
    );
  });

  it("counts redirected escalated bookings against the final lecturer target", async () => {
    repo.findQuotaLecturerMetadata.mockResolvedValue([
      createLecturer({ lecturerId: "lecturer-1" }),
      createLecturer({ lecturerId: "lecturer-2" }),
    ]);
    repo.findTrackedAdvisorRequests.mockResolvedValue([
      createRequest({
        id: "req-redirected-1",
        lecturerId: "lecturer-1",
        redirectedTo: "lecturer-2",
        studentId: "student-redirected",
        thesisId: "thesis-redirected",
        status: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
        routeType: "escalated",
      }),
    ]);

    const snapshots = await getLecturerQuotaSnapshots({
      academicYearId: "ay-1",
      includeEntries: true,
    });
    const originalSnapshot = snapshots.find((snapshot) => snapshot.lecturerId === "lecturer-1");
    const redirectedSnapshot = snapshots.find((snapshot) => snapshot.lecturerId === "lecturer-2");

    expect(originalSnapshot.bookingCount).toBe(0);
    expect(redirectedSnapshot.bookingCount).toBe(1);
    expect(redirectedSnapshot.bookingEntries[0]).toEqual(
      expect.objectContaining({
        requestId: "req-redirected-1",
        lecturerId: "lecturer-2",
        requestStatus: ADVISOR_REQUEST_STATUS.BOOKING_APPROVED,
      }),
    );
  });
});
