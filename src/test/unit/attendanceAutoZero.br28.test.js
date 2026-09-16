/**
 * Kontrak auto-zero BR-28 (canon §5.7.3) — audit SIMPTA-FUN-018 + SIMPTA-FUN-019:
 * - keempat titik enforcement (submit P1, co-sign P2, submit Koordinator,
 *   publish final) menolak penilaian dengan status 403, bukan 200 sukses
 * - penerapan ulang auto-zero idempoten: `attendanceAutoZeroedAt`,
 *   `finalizedAt`, dan `finalizedBy` dari auto-zero pertama tidak ditimpa
 * - notifikasi hanya dikirim untuk penerapan auto-zero yang benar-benar baru
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ROLES } from "../../constants/roles.js";

const prismaMock = vi.hoisted(() => ({
  thesis: { findUnique: vi.fn() },
  researchMethodScore: { findUnique: vi.fn(), update: vi.fn(), create: vi.fn() },
  researchMethodScoreDetail: { deleteMany: vi.fn(), upsert: vi.fn() },
  metopenAttendanceImport: { findFirst: vi.fn() },
  metopenAttendanceRecord: { findFirst: vi.fn(), update: vi.fn() },
  metopenAssessmentCriteria: { findMany: vi.fn() },
  thesisSupervisors: { findFirst: vi.fn() },
  user: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

const notificationMock = vi.hoisted(() => ({
  createNotificationEventForUsers: vi.fn(),
}));

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));
vi.mock("../../services/notification.service.js", () => notificationMock);
vi.mock("../../services/metopen.service.js", () => ({
  syncKadepProposalQueueByThesisId: vi.fn(),
}));
vi.mock("../../services/metopenScoreComposition.service.js", () => ({
  getCapForRole: vi.fn(async () => ({
    cap: 75,
    composition: { academicYearId: "ay-1", ta03aCap: 75, ta03bCap: 25 },
  })),
  getCompositionForAcademicYear: vi.fn(async () => ({
    academicYearId: "ay-1",
    ta03aCap: 75,
    ta03bCap: 25,
  })),
  resolveAcademicYearIdForThesis: vi.fn(async () => "ay-1"),
}));

const { applyAttendanceAutoZeroForThesis } = await import(
  "../../services/metopenAttendance.service.js"
);
const {
  submitSupervisorScore,
  coSignSupervisorScore,
  submitMetopenScore,
  publishFinalScore,
} = await import("../../services/assessment.service.js");

const STUDENT_USER_ID = "user-student-1";
const P1_USER_ID = "user-lecturer-p1";
const P2_USER_ID = "user-lecturer-p2";
const KOORDINATOR_USER_ID = "user-koordinator";
const FIRST_AUTO_ZERO_AT = new Date("2026-05-10T09:00:00.000Z");

const ATTENDANCE_IMPORT = {
  id: "attendance-import-1",
  academicYearId: "ay-1",
  uploadedByUserId: KOORDINATOR_USER_ID,
  classCode: "JSI60143/SI/Kuliah/A",
  courseName: "Metode Penelitian",
  thresholdPercent: 0.75,
  uploadedAt: new Date("2026-05-12T08:31:20.000Z"),
  records: [],
};

/**
 * Satu fixture thesis untuk semua pembacaan `thesis.findUnique`:
 * gate assessment, resolusi periode presensi, dan lookup penerima notifikasi.
 */
function thesisFixture() {
  return {
    id: "thesis-1",
    title: "Modul Pengelolaan Proposal",
    studentId: "student-1",
    academicYearId: "ay-1",
    ta04AssignmentAcademicYearId: null,
    ta04AssignmentIssuedAt: new Date("2026-07-01T00:00:00.000Z"),
    finalProposalVersionId: "proposal-version-1",
    student: {
      status: "active",
      user: { id: STUDENT_USER_ID, fullName: "Ilham", identityNumber: "2211523001" },
    },
    thesisStatus: { name: "Bimbingan" },
    thesisSupervisors: [
      {
        id: "ts-p1",
        role: { name: ROLES.PEMBIMBING_1 },
        lecturer: { user: { id: P1_USER_ID, fullName: "Dosen P1" } },
      },
      {
        id: "ts-p2",
        role: { name: ROLES.PEMBIMBING_2 },
        lecturer: { user: { id: P2_USER_ID, fullName: "Dosen P2" } },
      },
    ],
  };
}

function ineligibleAttendanceRecord() {
  return {
    id: "attendance-record-low",
    importId: ATTENDANCE_IMPORT.id,
    studentId: "student-1",
    identityNumber: "2211523001",
    studentName: "Ilham",
    presentCount: 5,
    absentCount: 4,
    totalMeetings: 9,
    attendancePercentage: 0.5556,
    isEligible: false,
    import: ATTENDANCE_IMPORT,
  };
}

function autoZeroedScoreRow(overrides = {}) {
  return {
    id: "score-1",
    thesisId: "thesis-1",
    supervisorScore: 0,
    lecturerScore: 0,
    finalScore: 0,
    isFinalized: true,
    finalizedBy: KOORDINATOR_USER_ID,
    finalizedAt: FIRST_AUTO_ZERO_AT,
    attendanceRecordId: "attendance-record-first",
    attendanceAutoZeroedAt: FIRST_AUTO_ZERO_AT,
    attendanceAutoZeroReason: "Presensi Metopel kurang dari 75%;",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (callback) => callback(prismaMock));
  prismaMock.thesis.findUnique.mockResolvedValue(thesisFixture());
  prismaMock.metopenAttendanceImport.findFirst.mockResolvedValue(ATTENDANCE_IMPORT);
  prismaMock.metopenAttendanceRecord.findFirst.mockResolvedValue(ineligibleAttendanceRecord());
  prismaMock.researchMethodScoreDetail.deleteMany.mockResolvedValue({ count: 0 });
  prismaMock.thesisSupervisors.findFirst.mockResolvedValue({ id: "ts-p2" });
  prismaMock.user.findMany.mockResolvedValue([]);
  prismaMock.metopenAssessmentCriteria.findMany.mockResolvedValue([
    { id: "crit-1", name: "Kriteria 1", maxScore: 10, displayOrder: 1 },
  ]);
  prismaMock.researchMethodScore.create.mockResolvedValue(
    autoZeroedScoreRow({ finalizedBy: "actor-baru", finalizedAt: new Date() }),
  );
  prismaMock.researchMethodScore.update.mockResolvedValue(
    autoZeroedScoreRow({ finalizedBy: "actor-baru", finalizedAt: new Date() }),
  );
});

describe("BR-28 — penolakan penilaian auto-zero mengembalikan 403 di keempat titik", () => {
  const rejection = {
    statusCode: 403,
    message: expect.stringMatching(/55\.6%.*di bawah ambang 75%/),
  };

  it("menolak submit TA-03A oleh Pembimbing 1", async () => {
    prismaMock.researchMethodScore.findUnique.mockResolvedValue(null);

    await expect(
      submitSupervisorScore("thesis-1", P1_USER_ID, {
        scores: [{ criteriaId: "crit-1", score: 10 }],
      }),
    ).rejects.toMatchObject(rejection);

    expect(prismaMock.researchMethodScoreDetail.upsert).not.toHaveBeenCalled();
  });

  it("menolak co-sign TA-03A oleh Pembimbing 2", async () => {
    prismaMock.researchMethodScore.findUnique.mockResolvedValue(null);

    await expect(
      coSignSupervisorScore("thesis-1", P2_USER_ID, { note: "setuju" }),
    ).rejects.toMatchObject(rejection);

    expect(prismaMock.researchMethodScore.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ coSignedByLecturerId: P2_USER_ID }),
      }),
    );
  });

  it("menolak submit TA-03B oleh Koordinator Matkul Metopen", async () => {
    prismaMock.researchMethodScore.findUnique.mockResolvedValue(null);

    await expect(
      submitMetopenScore("thesis-1", KOORDINATOR_USER_ID, {
        scores: [{ criteriaId: "crit-1", score: 10 }],
      }),
    ).rejects.toMatchObject(rejection);

    expect(prismaMock.researchMethodScoreDetail.upsert).not.toHaveBeenCalled();
  });

  it("menolak publish nilai akhir gabungan", async () => {
    prismaMock.researchMethodScore.findUnique
      .mockResolvedValueOnce({
        id: "score-1",
        lecturerId: KOORDINATOR_USER_ID,
        supervisorScore: 70,
        lecturerScore: 20,
        isFinalized: false,
      })
      .mockResolvedValue({
        id: "score-1",
        thesisId: "thesis-1",
        isFinalized: false,
        attendanceAutoZeroedAt: null,
      });

    await expect(publishFinalScore("thesis-1", KOORDINATOR_USER_ID)).rejects.toMatchObject(
      rejection,
    );

    expect(prismaMock.researchMethodScore.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ finalScore: 90 }),
      }),
    );
  });
});

describe("BR-28 — penerapan ulang auto-zero idempoten (BR-21, anti-pattern #20)", () => {
  it("tidak menimpa attendanceAutoZeroedAt, finalizedAt, dan finalizedBy yang sudah ada", async () => {
    const existing = autoZeroedScoreRow();
    prismaMock.researchMethodScore.findUnique.mockResolvedValue(existing);

    const result = await applyAttendanceAutoZeroForThesis(
      "thesis-1",
      "user-koordinator-pengganti",
      "attendance-record-low",
      { attendancePercentage: 0.5556, thresholdPercent: 0.75, skipFinalized: true },
    );

    expect(result.alreadyAutoZeroed).toBe(true);
    expect(result.scoreRecord.attendanceAutoZeroedAt).toEqual(FIRST_AUTO_ZERO_AT);
    expect(result.scoreRecord.finalizedAt).toEqual(FIRST_AUTO_ZERO_AT);
    expect(result.scoreRecord.finalizedBy).toBe(KOORDINATOR_USER_ID);
    expect(prismaMock.researchMethodScore.update).not.toHaveBeenCalled();
    expect(prismaMock.researchMethodScore.create).not.toHaveBeenCalled();
    expect(prismaMock.researchMethodScoreDetail.deleteMany).not.toHaveBeenCalled();
  });

  it("tetap menerapkan auto-zero pertama kali beserta jejak finalisasi", async () => {
    prismaMock.researchMethodScore.findUnique.mockResolvedValue(null);

    const result = await applyAttendanceAutoZeroForThesis(
      "thesis-1",
      KOORDINATOR_USER_ID,
      "attendance-record-low",
      { attendancePercentage: 0.5556, thresholdPercent: 0.75 },
    );

    expect(result.alreadyAutoZeroed).toBe(false);
    expect(prismaMock.researchMethodScore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        thesisId: "thesis-1",
        supervisorScore: 0,
        lecturerScore: 0,
        finalScore: 0,
        isFinalized: true,
        finalizedBy: KOORDINATOR_USER_ID,
        finalizedAt: expect.any(Date),
        attendanceAutoZeroedAt: expect.any(Date),
      }),
    });
  });
});

describe("BR-28 — notifikasi auto-zero (SIMPTA-FUN-019)", () => {
  it("memberi tahu mahasiswa, P1, P2, dan Koordinator pemicu saat auto-zero baru", async () => {
    prismaMock.researchMethodScore.findUnique.mockResolvedValue(null);

    await applyAttendanceAutoZeroForThesis(
      "thesis-1",
      KOORDINATOR_USER_ID,
      "attendance-record-low",
      { attendancePercentage: 0.5556, thresholdPercent: 0.75 },
    );

    const calls = notificationMock.createNotificationEventForUsers.mock.calls;
    expect(calls).toHaveLength(3);

    const [studentIds, studentPayload] = calls[0];
    expect(studentIds).toEqual([STUDENT_USER_ID]);
    expect(studentPayload.type).toBe("simpta_ta03_attendance_auto_zero");
    expect(studentPayload.message).toMatch(/55\.6%/);
    expect(studentPayload.message).toMatch(/di bawah ambang 75%/);
    expect(studentPayload.message).toMatch(/final/i);

    const [supervisorIds, supervisorPayload] = calls[1];
    expect(supervisorIds).toEqual([P1_USER_ID, P2_USER_ID]);
    expect(supervisorPayload.type).toBe("simpta_ta03_attendance_auto_zero_notice");

    const [actorIds, actorPayload] = calls[2];
    expect(actorIds).toEqual([KOORDINATOR_USER_ID]);
    expect(actorPayload.type).toBe("simpta_ta03_attendance_auto_zero_notice");
  });

  it("tidak mengirim notifikasi ulang saat presensi diunggah ulang untuk peristiwa yang sama", async () => {
    prismaMock.researchMethodScore.findUnique.mockResolvedValue(null);
    await applyAttendanceAutoZeroForThesis("thesis-1", KOORDINATOR_USER_ID, "attendance-record-low", {
      attendancePercentage: 0.5556,
      thresholdPercent: 0.75,
    });
    const callsAfterFirst = notificationMock.createNotificationEventForUsers.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // Re-upload presensi koreksi SIA: thesis masih <75% dan sudah auto-zero.
    prismaMock.researchMethodScore.findUnique.mockResolvedValue(autoZeroedScoreRow());
    await applyAttendanceAutoZeroForThesis("thesis-1", KOORDINATOR_USER_ID, "attendance-record-low", {
      attendancePercentage: 0.5556,
      thresholdPercent: 0.75,
      skipFinalized: true,
    });

    expect(notificationMock.createNotificationEventForUsers.mock.calls.length).toBe(
      callsAfterFirst,
    );
  });

  it("tidak mengirim notifikasi saat auto-zero dilewati karena nilai sudah final manual", async () => {
    prismaMock.researchMethodScore.findUnique.mockResolvedValue({
      id: "score-manual-final",
      thesisId: "thesis-1",
      isFinalized: true,
      attendanceAutoZeroedAt: null,
      finalizedBy: P1_USER_ID,
      finalizedAt: FIRST_AUTO_ZERO_AT,
    });

    const result = await applyAttendanceAutoZeroForThesis(
      "thesis-1",
      KOORDINATOR_USER_ID,
      "attendance-record-low",
      { attendancePercentage: 0.5556, thresholdPercent: 0.75, skipFinalized: true },
    );

    expect(result.skipped).toBe(true);
    expect(notificationMock.createNotificationEventForUsers).not.toHaveBeenCalled();
    expect(prismaMock.researchMethodScore.update).not.toHaveBeenCalled();
  });
});
