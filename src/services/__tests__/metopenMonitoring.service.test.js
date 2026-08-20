/**
 * Unit tests untuk `metopenMonitoring.service.js`.
 *
 * Scope:
 *  - Mocked repository → tidak butuh DB live, fokus uji LOGIC enrichment.
 *  - Edge cases sesuai spec: belum advisor, berbagai status advisor, attendance
 *    borderline, auto-zero, scoring partial/complete/published, dual supervisor,
 *    unmatched row, missing from import.
 *
 * Catatan: pakai mocking via `vi.mock` agar repository di-replace dengan
 * test double. Service yang asli tetap dipanggil untuk verify behavior end
 * to end di layer service.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const repoMock = {
  findEligibleMetopenStudents: vi.fn(),
  findLatestAttendanceImportWithRecords: vi.fn(),
  findAdvisorRequestsByStudentIds: vi.fn(),
  findActiveSupervisorsByStudentIds: vi.fn(),
  findResearchMethodScoresByStudentIds: vi.fn(),
  findAcademicYearById: vi.fn(),
  countStudentSnapshots: vi.fn(),
};

vi.mock("../../repositories/metopenMonitoring.repository.js", () => repoMock);

const monitoringService = await import("../metopenMonitoring.service.js");
const { __test } = monitoringService;
const getMetopenMonitoring = (options = {}) => monitoringService.getMetopenMonitoring({
  academicYearId: "ay-1",
  ...options,
});

// Helper builders untuk shorter test code.
function studentFixture(overrides = {}) {
  return {
    id: overrides.id ?? "stu-1",
    eligibleMetopen: true,
    metopenEligibilitySource: "sia",
    metopenEligibilityUpdatedAt: new Date("2026-05-01"),
    status: "active",
    enrollmentYear: 2023,
    researchMethodCompleted: false,
    takingThesisCourse: true,
    user: {
      id: overrides.id ?? "stu-1",
      fullName: overrides.fullName ?? "Edge Student",
      identityNumber: overrides.nim ?? "2399000001",
      email: "edge@dummy.ac.id",
      avatarUrl: null,
    },
    ...overrides,
  };
}

function advisorRequestFixture(overrides = {}) {
  return {
    id: overrides.id ?? "req-1",
    studentId: overrides.studentId ?? "stu-1",
    lecturerId: overrides.lecturerId ?? "lec-1",
    thesisId: overrides.thesisId ?? null,
    proposedTitle: "Judul Proposal",
    status: overrides.status ?? "pending",
    routeType: overrides.routeType ?? "normal",
    requestType: overrides.requestType ?? "ta_01",
    acceptedOverNormal: false,
    forwardedToKadepAt: null,
    forwardedByLecturerId: null,
    withdrawnAt: null,
    createdAt: new Date("2026-04-01"),
    updatedAt: new Date("2026-04-02"),
    lecturer: overrides.lecturer ?? {
      id: "lec-1",
      user: { id: "lec-1", fullName: "Dr. Doe" },
    },
    redirectTarget: null,
    ...overrides,
  };
}

function attendanceRecordFixture(overrides = {}) {
  return {
    id: overrides.id ?? "att-rec-1",
    // `??` tidak fall through saat `null` di-pass eksplisit. Untuk kasus unmatched
    // (studentId=null) caller WAJIB pass `{ studentId: null }`, dan kita honor.
    studentId: "studentId" in overrides ? overrides.studentId : "stu-1",
    identityNumber: overrides.identityNumber ?? "2399000001",
    studentName: overrides.studentName ?? "Edge Student",
    presentCount: overrides.presentCount ?? 9,
    absentCount: overrides.absentCount ?? 0,
    sickCount: 0,
    permitCount: 0,
    totalMeetings: overrides.totalMeetings ?? 9,
    attendancePercentage: overrides.attendancePercentage ?? 1.0,
    isEligible: overrides.isEligible ?? true,
  };
}

function scoreFixture(overrides = {}) {
  return {
    id: overrides.id ?? "score-1",
    thesisId: overrides.thesisId ?? "thesis-1",
    supervisorId: overrides.supervisorId ?? null,
    supervisorScore: overrides.supervisorScore ?? null,
    lecturerId: overrides.lecturerId ?? null,
    lecturerScore: overrides.lecturerScore ?? null,
    finalScore: overrides.finalScore ?? null,
    isFinalized: overrides.isFinalized ?? false,
    finalizedAt: overrides.finalizedAt ?? null,
    coSignedByLecturerId: overrides.coSignedByLecturerId ?? null,
    coSignedAt: overrides.coSignedAt ?? null,
    attendanceRecordId: overrides.attendanceRecordId ?? null,
    attendanceAutoZeroedAt: overrides.attendanceAutoZeroedAt ?? null,
    attendanceAutoZeroReason: overrides.attendanceAutoZeroReason ?? null,
    thesis: {
      id: overrides.thesisId ?? "thesis-1",
      studentId: overrides.studentId ?? "stu-1",
      title: "Thesis Title",
      isProposal: true,
      proposalStatus: null,
    },
    researchMethodScoreDetails: overrides.researchMethodScoreDetails ?? [],
  };
}

function supervisorFixture({ studentId, lecturerId, lecturerName, role }) {
  return {
    id: `sup-${studentId}-${role}`,
    lecturerId,
    role: { id: `role-${role}`, name: role },
    lecturer: { id: lecturerId, user: { id: lecturerId, fullName: lecturerName } },
    thesis: { id: `thesis-${studentId}`, studentId, title: "T", proposalStatus: null, isProposal: true },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findAcademicYearById.mockResolvedValue({
    id: "ay-1",
    year: "2025/2026",
    semester: "genap",
    startDate: new Date("2026-01-13T00:00:00.000Z"),
    endDate: new Date("2026-07-31T23:59:59.999Z"),
  });
  repoMock.countStudentSnapshots.mockResolvedValue({ total: 3, eligible: 3 });
});

describe("metopenMonitoring.service — getMetopenMonitoring", () => {
  it("EC01 (no advisor): tampilkan mahasiswa dengan status 'Belum mencari pembimbing'", async () => {
    const stu = studentFixture({ id: "stu-ec01", nim: "2399000001" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.students).toHaveLength(1);
    const row = out.students[0];
    expect(row.advisorRequest.status).toBe("none");
    expect(row.advisorRequest.statusLabel).toBe("Belum mencari pembimbing");
    expect(row.advisorRequest.statusCategory).toBe("no_advisor");
    expect(row.attendance).toBeNull();
    expect(row.score.completeness).toBe("none");
    expect(out.stats.advisorByCategory.no_advisor).toBe(1);
    expect(repoMock.findEligibleMetopenStudents).toHaveBeenCalledWith(
      "ay-1",
      undefined,
    );
    expect(repoMock.findAdvisorRequestsByStudentIds).toHaveBeenCalledWith(
      ["stu-ec01"],
      "ay-1",
      undefined,
    );
  });

  it.each([
    ["pending", "pending_review", "Menunggu respon dosen"],
    ["under_review", "pending_review", "Sedang ditinjau dosen"],
    ["pending_kadep", "pending_kadep", "Menunggu validasi KaDep"],
    ["booking_approved", "active_pre_ta04", "Booking pembimbing"],
    ["active_official", "active_official", "Beban aktif TA"],
    ["released", "released", "Booking dilepas"],
    ["rejected_by_dosen", "rejected", "Ditolak dosen"],
    ["rejected_by_kadep", "rejected", "Ditolak KaDep"],
    ["canceled", "withdrawn", "Dibatalkan"],
    ["withdrawn", "withdrawn", "Ditarik mahasiswa"],
    ["revision_requested", "revision", "Revisi TA-02 oleh KaDep"],
  ])("EC02-EC11 advisor status '%s' → kategori '%s' label '%s'", async (status, cat, label) => {
    const stu = studentFixture({ id: "stu-x" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([
      advisorRequestFixture({ studentId: stu.id, status }),
    ]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].advisorRequest.status).toBe(status);
    expect(out.students[0].advisorRequest.statusCategory).toBe(cat);
    expect(out.students[0].advisorRequest.statusLabel).toBe(label);
  });

  it("EC04 (Path C escalated): expose forwardedToKadepAt + acceptedOverNormal saat applicable", async () => {
    const stu = studentFixture({ id: "stu-ec04" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([
      advisorRequestFixture({
        studentId: stu.id,
        status: "pending_kadep",
        routeType: "escalated",
        forwardedToKadepAt: new Date("2026-05-10"),
        forwardedByLecturerId: "lec-1",
      }),
    ]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    const adv = out.students[0].advisorRequest;
    expect(adv.routeType).toBe("escalated");
    expect(adv.routeLabel).toContain("di atas kuota normal");
    expect(adv.forwardedToKadepAt).toEqual(new Date("2026-05-10"));
  });

  it("EC05 (TA-02 dept): routeType=dept dengan lecturerId=null mapping route Path A", async () => {
    const stu = studentFixture({ id: "stu-ec05" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([
      advisorRequestFixture({
        studentId: stu.id,
        lecturerId: null,
        status: "pending_kadep",
        routeType: "dept",
        requestType: "ta_02",
        lecturer: null,
      }),
    ]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    const adv = out.students[0].advisorRequest;
    expect(adv.routeType).toBe("dept");
    expect(adv.routeLabel).toContain("Departemen");
    expect(adv.requestType).toBe("ta_02");
  });

  it("EC07 (Overquota Sah): acceptedOverNormal=true di-expose", async () => {
    const stu = studentFixture({ id: "stu-ec07" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([
      advisorRequestFixture({
        studentId: stu.id,
        status: "booking_approved",
        routeType: "escalated",
        acceptedOverNormal: true,
      }),
    ]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].advisorRequest.acceptedOverNormal).toBe(true);
  });

  it("EC08 (Dual supervisor): P1+P2 muncul di payload supervisors", async () => {
    const stu = studentFixture({ id: "stu-ec08" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([
      advisorRequestFixture({ studentId: stu.id, status: "active_official" }),
    ]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([
      supervisorFixture({
        studentId: stu.id,
        lecturerId: "lec-1",
        lecturerName: "Dr. Doe",
        role: "Pembimbing 1",
      }),
      supervisorFixture({
        studentId: stu.id,
        lecturerId: "lec-2",
        lecturerName: "Dr. Wang",
        role: "Pembimbing 2",
      }),
    ]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].supervisors.pembimbing1.fullName).toBe("Dr. Doe");
    expect(out.students[0].supervisors.pembimbing2.fullName).toBe("Dr. Wang");
  });

  it("EC12 (TA-03A partial only): completeness='partial_ta03a' + bucket presentasi/konten/respons terisi", async () => {
    const stu = studentFixture({ id: "stu-ec12" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([
      scoreFixture({
        studentId: stu.id,
        supervisorScore: 65,
        researchMethodScoreDetails: [
          {
            score: 18,
            criteria: { id: "c1", role: "supervisor", maxScore: 20, metopenCpmk: { code: "CPMK-01" } },
          },
          {
            score: 35,
            criteria: { id: "c2", role: "supervisor", maxScore: 40, metopenCpmk: { code: "CPMK-02" } },
          },
          {
            score: 12,
            criteria: { id: "c3", role: "supervisor", maxScore: 15, metopenCpmk: { code: "CPMK-03" } },
          },
        ],
      }),
    ]);

    const out = await getMetopenMonitoring();
    const score = out.students[0].score;
    expect(score.completeness).toBe("partial_ta03a");
    expect(score.presentasi).toBe(18);
    expect(score.proposalKonten).toBe(35);
    expect(score.kemampuanRespon).toBe(12);
    expect(score.proposalStruktur).toBeNull();
  });

  it("EC13 (TA-03B partial only): completeness='partial_ta03b'", async () => {
    const stu = studentFixture({ id: "stu-ec13" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([
      scoreFixture({
        studentId: stu.id,
        lecturerScore: 20,
        researchMethodScoreDetails: [
          {
            score: 20,
            criteria: { id: "c4", role: "default", maxScore: 25, metopenCpmk: { code: "CPMK-02" } },
          },
        ],
      }),
    ]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].score.completeness).toBe("partial_ta03b");
    expect(out.students[0].score.proposalStruktur).toBe(20);
  });

  it("EC14 (complete pending publish): supervisorScore + lecturerScore terisi, finalScore null", async () => {
    const stu = studentFixture({ id: "stu-ec14" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([
      scoreFixture({
        studentId: stu.id,
        supervisorScore: 70,
        lecturerScore: 22,
        finalScore: null,
        isFinalized: false,
      }),
    ]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].score.completeness).toBe("complete_pending");
    expect(out.students[0].score.finalScore).toBeNull();
  });

  it("EC15 (published): completeness='published' saat isFinalized=true + finalScore", async () => {
    const stu = studentFixture({ id: "stu-ec15" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([
      scoreFixture({
        studentId: stu.id,
        supervisorScore: 70,
        lecturerScore: 22,
        finalScore: 92,
        isFinalized: true,
        finalizedAt: new Date("2026-05-10"),
      }),
    ]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].score.completeness).toBe("published");
    expect(out.students[0].score.finalScore).toBe(92);
    expect(out.students[0].score.isFinalized).toBe(true);
  });

  it("EC16 (auto-zero): bucket semua jadi 0, completeness='auto_zero', supervisorScore=lecturerScore=0", async () => {
    const stu = studentFixture({ id: "stu-ec16" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([
      scoreFixture({
        studentId: stu.id,
        supervisorScore: 0,
        lecturerScore: 0,
        finalScore: 0,
        isFinalized: true,
        attendanceAutoZeroedAt: new Date("2026-05-10"),
        attendanceAutoZeroReason: "Presensi <75%",
      }),
    ]);

    const out = await getMetopenMonitoring();
    const score = out.students[0].score;
    expect(score.completeness).toBe("auto_zero");
    expect(score.presentasi).toBe(0);
    expect(score.proposalKonten).toBe(0);
    expect(score.proposalStruktur).toBe(0);
    expect(score.kemampuanRespon).toBe(0);
    expect(score.attendanceAutoZeroedAt).not.toBeNull();
  });

  it("EC17 (borderline 75%): attendance.isEligible=true saat percentage tepat 0.75", async () => {
    const stu = studentFixture({ id: "stu-ec17", nim: "2399000017" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue({
      id: "import-1",
      classCode: "TEST",
      thresholdPercent: 0.75,
      uploadedAt: new Date(),
      records: [
        attendanceRecordFixture({
          studentId: stu.id,
          identityNumber: "2399000017",
          presentCount: 6,
          totalMeetings: 8,
          attendancePercentage: 0.75,
          isEligible: true,
        }),
      ],
    });
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].attendance.attendancePercentage).toBeCloseTo(0.75);
    expect(out.students[0].attendance.isEligible).toBe(true);
  });

  it("EC18 (borderline 74.99%): attendance.isEligible=false", async () => {
    const stu = studentFixture({ id: "stu-ec18", nim: "2399000018" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue({
      id: "import-1",
      classCode: "TEST",
      thresholdPercent: 0.75,
      uploadedAt: new Date(),
      records: [
        attendanceRecordFixture({
          studentId: stu.id,
          identityNumber: "2399000018",
          presentCount: 7,
          totalMeetings: 10,
          attendancePercentage: 0.7499,
          isEligible: false,
        }),
      ],
    });
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].attendance.attendancePercentage).toBeCloseTo(0.7499);
    expect(out.students[0].attendance.isEligible).toBe(false);
  });

  it("EC19 (missing from import): mahasiswa eligible SIA tetap muncul dengan attendance=null + isInImport=false", async () => {
    const stu = studentFixture({ id: "stu-ec19", nim: "2399000019" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue({
      id: "import-1",
      classCode: "TEST",
      thresholdPercent: 0.75,
      uploadedAt: new Date(),
      records: [
        // Tidak ada record untuk stu-ec19 di import — record lain tidak match identityNumber.
        attendanceRecordFixture({
          studentId: "stu-other",
          identityNumber: "2399000099",
        }),
      ],
    });
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.students[0].isInImport).toBe(false);
    expect(out.students[0].attendance).toBeNull();
    expect(out.stats.missingFromImport).toBe(1);
  });

  it("EC20 (unmatched row): record di import dengan studentId=null muncul di unmatchedRecords", async () => {
    repoMock.findEligibleMetopenStudents.mockResolvedValue([]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue({
      id: "import-1",
      classCode: "TEST",
      thresholdPercent: 0.75,
      uploadedAt: new Date(),
      records: [
        attendanceRecordFixture({
          studentId: null,
          identityNumber: "9999900099",
          studentName: "UNMATCHED PERSON",
        }),
      ],
    });
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.students).toHaveLength(0);
    expect(out.unmatchedRecords).toHaveLength(1);
    expect(out.unmatchedRecords[0].identityNumber).toBe("9999900099");
    expect(out.unmatchedRecords[0].fullName).toBe("UNMATCHED PERSON");
    expect(out.stats.unmatchedInImport).toBe(1);
  });

  it("indexLatestAdvisorRequest: ambil row pertama per studentId (first-wins setelah sort updatedAt desc)", () => {
    const reqs = [
      advisorRequestFixture({
        id: "newer",
        studentId: "stu-1",
        status: "booking_approved",
        updatedAt: new Date("2026-05-10"),
      }),
      advisorRequestFixture({
        id: "older",
        studentId: "stu-1",
        status: "pending",
        updatedAt: new Date("2026-04-01"),
      }),
    ];
    const map = __test.indexLatestAdvisorRequest(reqs);
    expect(map.get("stu-1").id).toBe("newer");
  });

  it("indexLatestScoreByStudent: utamakan finalized > recent updated", () => {
    const scores = [
      scoreFixture({ id: "recent", studentId: "stu-1", isFinalized: false }),
      scoreFixture({ id: "finalized", studentId: "stu-1", isFinalized: true }),
    ];
    const map = __test.indexLatestScoreByStudent(scores);
    expect(map.get("stu-1").id).toBe("finalized");
  });

  it("classifyScoreCompleteness: matrix exhaustive", () => {
    const { classifyScoreCompleteness: fn } = __test;
    expect(fn(null)).toBe("none");
    expect(fn(scoreFixture())).toBe("none");
    expect(fn(scoreFixture({ supervisorScore: 65 }))).toBe("partial_ta03a");
    expect(fn(scoreFixture({ lecturerScore: 20 }))).toBe("partial_ta03b");
    expect(fn(scoreFixture({ supervisorScore: 65, lecturerScore: 20 }))).toBe("complete_pending");
    expect(
      fn(scoreFixture({ supervisorScore: 65, lecturerScore: 20, finalScore: 85, isFinalized: true })),
    ).toBe("published");
    expect(
      fn(scoreFixture({ supervisorScore: 0, lecturerScore: 0, finalScore: 0, isFinalized: true, attendanceAutoZeroedAt: new Date() })),
    ).toBe("auto_zero");
  });

  it("buildSummaryStats: agregat 19 mahasiswa multi-status", async () => {
    // Build 5 mahasiswa: 1 no-advisor, 1 pending, 1 booking, 1 published, 1 auto-zero.
    const fixtures = [
      { id: "s1", status: null, scoreOverrides: null },
      { id: "s2", status: "pending", scoreOverrides: null },
      { id: "s3", status: "booking_approved", scoreOverrides: { supervisorScore: 65, lecturerScore: 22 } },
      {
        id: "s4",
        status: "active_official",
        scoreOverrides: {
          supervisorScore: 70,
          lecturerScore: 22,
          finalScore: 92,
          isFinalized: true,
        },
      },
      {
        id: "s5",
        status: "booking_approved",
        scoreOverrides: {
          supervisorScore: 0,
          lecturerScore: 0,
          finalScore: 0,
          isFinalized: true,
          attendanceAutoZeroedAt: new Date(),
        },
      },
    ];

    repoMock.findEligibleMetopenStudents.mockResolvedValue(
      fixtures.map((f) => studentFixture({ id: f.id, nim: `nim-${f.id}` })),
    );
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue(
      fixtures
        .filter((f) => f.status)
        .map((f) => advisorRequestFixture({ studentId: f.id, status: f.status })),
    );
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue(
      fixtures
        .filter((f) => f.scoreOverrides)
        .map((f) => scoreFixture({ studentId: f.id, ...f.scoreOverrides })),
    );

    const out = await getMetopenMonitoring();
    expect(out.stats.totalEligibleSia).toBe(5);
    expect(out.stats.advisorByCategory.no_advisor).toBe(1);
    expect(out.stats.advisorByCategory.pending_review).toBe(1);
    expect(out.stats.advisorByCategory.active_pre_ta04).toBe(2);
    expect(out.stats.advisorByCategory.active_official).toBe(1);
    expect(out.stats.scoreByCompleteness.published).toBe(1);
    expect(out.stats.scoreByCompleteness.auto_zero).toBe(1);
    expect(out.stats.scoreByCompleteness.complete_pending).toBe(1);
    expect(out.stats.scoreByCompleteness.none).toBe(2);
  });
});

/**
 * SIMPTA-FUN-003: roster kosong wajib membawa sebab yang spesifik (pola
 * `ta03GateReason`), dan `stats` tidak boleh melaporkan 0 sementara
 * `attendanceImport` melaporkan baris cocok di payload yang sama.
 */
describe("metopenMonitoring.service — sebab roster kosong (pola ta03GateReason)", () => {
  function mockEmptyEnrichment() {
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);
  }

  it("snapshot SIA periode belum ada → reasonCode 'sia_snapshot_missing' + arahan sinkronisasi", async () => {
    repoMock.findEligibleMetopenStudents.mockResolvedValue([]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.countStudentSnapshots.mockResolvedValue({ total: 0, eligible: 0 });
    mockEmptyEnrichment();

    const out = await getMetopenMonitoring();
    expect(out.roster.isEmpty).toBe(true);
    expect(out.roster.reasonCode).toBe(__test.ROSTER_EMPTY_REASON.SIA_SNAPSHOT_MISSING);
    expect(out.roster.reason).toContain("snapshot kelayakan SIA");
    expect(out.roster.reason).toContain("2025/2026 Genap");
    expect(out.roster.actionHint).toContain("sinkronisasi data SIA");
    expect(out.roster.snapshotTotal).toBe(0);
  });

  it("snapshot ada tetapi tidak ada yang eligible → reasonCode 'no_eligible_student'", async () => {
    repoMock.findEligibleMetopenStudents.mockResolvedValue([]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.countStudentSnapshots.mockResolvedValue({ total: 12, eligible: 0 });
    mockEmptyEnrichment();

    const out = await getMetopenMonitoring();
    expect(out.roster.reasonCode).toBe(__test.ROSTER_EMPTY_REASON.NO_ELIGIBLE_STUDENT);
    expect(out.roster.reason).toContain("12 mahasiswa");
    expect(out.roster.actionHint).toContain("kelayakan Metopel");
    expect(out.roster.snapshotTotal).toBe(12);
  });

  it("roster terisi → tidak ada sebab kosong yang dilaporkan", async () => {
    repoMock.findEligibleMetopenStudents.mockResolvedValue([studentFixture({ id: "stu-1" })]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    repoMock.countStudentSnapshots.mockResolvedValue({ total: 4, eligible: 1 });
    mockEmptyEnrichment();

    const out = await getMetopenMonitoring();
    expect(out.roster.isEmpty).toBe(false);
    expect(out.roster.reasonCode).toBeNull();
    expect(out.roster.reason).toBeNull();
    expect(out.roster.actionHint).toBeNull();
  });

  it("roster kosong + import punya baris cocok → stats.import melaporkan angka import, bukan 0", async () => {
    repoMock.findEligibleMetopenStudents.mockResolvedValue([]);
    repoMock.countStudentSnapshots.mockResolvedValue({ total: 0, eligible: 0 });
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue({
      id: "import-1",
      academicYearId: "ay-1",
      semesterLabel: "Genap 2025/2026",
      thresholdPercent: 0.75,
      totalRows: 3,
      matchedRows: 2,
      eligibleRows: 2,
      ineligibleRows: 1,
      autoZeroedCount: 1,
      skippedFinalizedCount: 0,
      uploadedAt: new Date("2026-05-01"),
      records: [
        attendanceRecordFixture({ studentId: "stu-outside-1", identityNumber: "2399000101" }),
        attendanceRecordFixture({
          studentId: "stu-outside-2",
          identityNumber: "2399000102",
          attendancePercentage: 0.5,
          isEligible: false,
        }),
        attendanceRecordFixture({ studentId: null, identityNumber: "9999900099" }),
      ],
    });
    mockEmptyEnrichment();

    const out = await getMetopenMonitoring();
    expect(out.stats.totalEligibleSia).toBe(0);
    expect(out.stats.totalInImport).toBe(0);
    expect(out.stats.import).not.toBeNull();
    expect(out.stats.import.totalRows).toBe(3);
    expect(out.stats.import.matchedRows).toBe(2);
    expect(out.stats.import.matchedInRoster).toBe(0);
    // Inilah angka yang menjelaskan kontradiksi: baris cocok yang ada di file
    // presensi tetapi mahasiswanya tidak ada di roster snapshot periode ini.
    expect(out.stats.import.matchedOutsideRoster).toBe(2);
    expect(out.stats.import.autoZeroedCount).toBe(1);
  });

  it("roster terisi sebagian → matchedInRoster + matchedOutsideRoster = matchedRows", async () => {
    const stu = studentFixture({ id: "stu-1", nim: "2399000001" });
    repoMock.findEligibleMetopenStudents.mockResolvedValue([stu]);
    repoMock.countStudentSnapshots.mockResolvedValue({ total: 1, eligible: 1 });
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue({
      id: "import-1",
      academicYearId: "ay-1",
      semesterLabel: "Genap 2025/2026",
      thresholdPercent: 0.75,
      uploadedAt: new Date("2026-05-01"),
      records: [
        attendanceRecordFixture({ studentId: "stu-1", identityNumber: "2399000001" }),
        attendanceRecordFixture({ studentId: "stu-outside", identityNumber: "2399000102" }),
      ],
    });
    mockEmptyEnrichment();

    const out = await getMetopenMonitoring();
    expect(out.stats.totalInImport).toBe(1);
    expect(out.stats.import.matchedInRoster).toBe(1);
    expect(out.stats.import.matchedOutsideRoster).toBe(1);
    expect(out.stats.import.matchedInRoster + out.stats.import.matchedOutsideRoster).toBe(
      out.stats.import.matchedRows,
    );
  });

  it("tanpa import presensi → stats.import null (tidak ada angka tanpa sumber)", async () => {
    repoMock.findEligibleMetopenStudents.mockResolvedValue([studentFixture({ id: "stu-1" })]);
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue(null);
    mockEmptyEnrichment();

    const out = await getMetopenMonitoring();
    expect(out.attendanceImport).toBeNull();
    expect(out.stats.import).toBeNull();
  });
});

/**
 * SIMPTA-FUN-039: tiga angka ringkasan impor harus dapat direkonsiliasi.
 * `eligibleRows`/`ineligibleRows` dihitung atas SELURUH baris file, sehingga
 * tidak berjumlah ke `matchedRows` — subset matched dibawa terpisah.
 */
describe("metopenMonitoring.service — rekonsiliasi angka import presensi", () => {
  const records = [
    attendanceRecordFixture({ studentId: "stu-1", identityNumber: "1", isEligible: true }),
    attendanceRecordFixture({ studentId: "stu-2", identityNumber: "2", isEligible: true }),
    attendanceRecordFixture({ studentId: "stu-3", identityNumber: "3", isEligible: false }),
    attendanceRecordFixture({ studentId: null, identityNumber: "4", isEligible: true }),
  ];

  it("identitas jumlah: total = matched + unmatched = eligible + ineligible", () => {
    const breakdown = __test.buildAttendanceRowBreakdown(records, {
      totalRows: 4,
      matchedRows: 3,
      eligibleRows: 3,
      ineligibleRows: 1,
    });
    expect(breakdown.totalRows).toBe(4);
    expect(breakdown.matchedRows + breakdown.unmatchedRows).toBe(breakdown.totalRows);
    expect(breakdown.eligibleRows + breakdown.ineligibleRows).toBe(breakdown.totalRows);
    expect(breakdown.matchedEligibleRows + breakdown.matchedIneligibleRows).toBe(
      breakdown.matchedRows,
    );
    expect(breakdown.matchedEligibleRows).toBe(2);
    expect(breakdown.matchedIneligibleRows).toBe(1);
    expect(breakdown.unmatchedEligibleRows).toBe(1);
    expect(breakdown.countersMatchRecords).toBe(true);
  });

  it("counter import yang tidak cocok dengan record ditandai countersMatchRecords=false", () => {
    const breakdown = __test.buildAttendanceRowBreakdown(records, {
      totalRows: 40,
      matchedRows: 3,
      eligibleRows: 3,
      ineligibleRows: 1,
    });
    expect(breakdown.countersMatchRecords).toBe(false);
  });

  it("label periode file berbeda dari periode yang diminta → mismatch terbaca", () => {
    const scope = __test.buildAttendanceImportPeriodScope(
      { academicYearId: "ay-1", semesterLabel: "Genap 2025/2026" },
      { id: "ay-1", year: "2026/2027", semester: "ganjil" },
      "ay-1",
    );
    expect(scope.attachedToRequestedPeriod).toBe(true);
    expect(scope.matchesRequestedPeriod).toBe(false);
    expect(scope.mismatchReason).toContain("Genap 2025/2026");
    expect(scope.mismatchReason).toContain("2026/2027 Ganjil");
  });

  it("label periode file sama dengan periode yang diminta → tanpa peringatan", () => {
    const scope = __test.buildAttendanceImportPeriodScope(
      { academicYearId: "ay-1", semesterLabel: "Genap 2025/2026" },
      { id: "ay-1", year: "2025/2026", semester: "genap" },
      "ay-1",
    );
    expect(scope.matchesRequestedPeriod).toBe(true);
    expect(scope.mismatchReason).toBeNull();
  });

  it("label periode tidak terbaca → matchesRequestedPeriod null (tidak menuduh mismatch)", () => {
    const scope = __test.buildAttendanceImportPeriodScope(
      { academicYearId: "ay-1", semesterLabel: null },
      { id: "ay-1", year: "2025/2026", semester: "genap" },
      "ay-1",
    );
    expect(scope.matchesRequestedPeriod).toBeNull();
    expect(scope.mismatchReason).toBeNull();
  });

  it("payload monitoring membawa rowBreakdown + periodScope pada attendanceImport", async () => {
    repoMock.findEligibleMetopenStudents.mockResolvedValue([]);
    repoMock.countStudentSnapshots.mockResolvedValue({ total: 0, eligible: 0 });
    repoMock.findLatestAttendanceImportWithRecords.mockResolvedValue({
      id: "import-1",
      academicYearId: "ay-1",
      semesterLabel: "Ganjil 2026/2027",
      thresholdPercent: 0.75,
      totalRows: 4,
      matchedRows: 3,
      eligibleRows: 3,
      ineligibleRows: 1,
      autoZeroedCount: 1,
      skippedFinalizedCount: 2,
      uploadedAt: new Date("2026-05-01"),
      records,
    });
    repoMock.findAdvisorRequestsByStudentIds.mockResolvedValue([]);
    repoMock.findActiveSupervisorsByStudentIds.mockResolvedValue([]);
    repoMock.findResearchMethodScoresByStudentIds.mockResolvedValue([]);

    const out = await getMetopenMonitoring();
    expect(out.attendanceImport.rowBreakdown.unmatchedRows).toBe(1);
    expect(out.attendanceImport.rowBreakdown.matchedIneligibleRows).toBe(1);
    expect(out.attendanceImport.skippedFinalizedCount).toBe(2);
    // Periode yang diminta genap 2025/2026, label file ganjil 2026/2027.
    expect(out.attendanceImport.periodScope.matchesRequestedPeriod).toBe(false);
    expect(out.stats.import.unmatchedRows).toBe(1);
    expect(out.stats.unmatchedInImport).toBe(1);
  });
});
