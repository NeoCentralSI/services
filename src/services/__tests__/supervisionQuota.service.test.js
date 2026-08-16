import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../repositories/supervisionQuota.repository.js", () => ({
  findAcademicYearById: vi.fn(),
  findAcademicYearBySlug: vi.fn(),
  getDefaultQuota: vi.fn(),
  setDefaultQuotaAndApplyToAllLecturers: vi.fn(),
  getLecturerQuotas: vi.fn(),
  getLecturerQuotaRecord: vi.fn(),
  upsertLecturerQuota: vi.fn(),
}));

vi.mock("../advisorQuota.service.js", () => ({
  getLecturerQuotaSnapshot: vi.fn(),
  getLecturerQuotaSnapshots: vi.fn(),
  syncAllLecturerQuotaCurrentCounts: vi.fn(),
  syncLecturerQuotaCurrentCount: vi.fn(),
}));

import * as repo from "../../repositories/supervisionQuota.repository.js";
import {
  getLecturerQuotaSnapshot,
  getLecturerQuotaSnapshots,
  syncLecturerQuotaCurrentCount,
} from "../advisorQuota.service.js";
import {
  getLecturerQuotaDetail,
  getLecturerQuotas,
} from "../supervisionQuota.service.js";

const ACADEMIC_YEAR_ID = "00000000-0000-4000-8000-000000000001";

function createSnapshot() {
  return {
    lecturerId: "lecturer-1",
    fullName: "DR. DOSEN UJI",
    identityNumber: "19800101",
    email: "dosen@example.com",
    scienceGroup: { id: "kbk-1", name: "Rekayasa Perangkat Lunak" },
    quotaRecordId: "quota-1",
    quotaMax: 10,
    quotaSoftLimit: 8,
    currentCount: 3,
    activeCount: 1,
    bookingCount: 2,
    pendingKadepCount: 1,
    normalAvailable: 7,
    overquotaAmount: 0,
    overquotaSahCount: 1,
    isNearLimit: false,
    isFull: false,
    activeOfficialEntries: [
      {
        id: "request-active",
        source: "request",
        requestId: "request-active",
        supervisorId: null,
        bucket: "active",
        studentId: "student-active",
        studentName: "MAHASISWA AKTIF",
        studentIdentityNumber: "2210000001",
        thesisId: "thesis-active",
        thesisTitle: "Judul Aktif",
        roleName: "Pembimbing 1",
        requestStatus: "active_official",
        routeType: "normal",
        acceptedOverNormal: false,
        studentJustification: "Tidak boleh bocor lewat kontrak monitoring",
        lecturerOverquotaReason: "Tidak boleh bocor lewat kontrak monitoring",
        createdAt: new Date("2026-07-01T00:00:00.000Z"),
      },
    ],
    bookingEntries: [
      {
        id: "request-booking-normal",
        source: "request",
        requestId: "request-booking-normal",
        supervisorId: null,
        bucket: "booking",
        studentId: "student-booking-normal",
        studentName: "MAHASISWA BOOKING NORMAL",
        studentIdentityNumber: "2210000002",
        thesisId: "thesis-booking-normal",
        thesisTitle: "Judul Booking Normal",
        roleName: "Pembimbing 1",
        requestStatus: "booking_approved",
        routeType: "normal",
        acceptedOverNormal: false,
        createdAt: new Date("2026-07-02T00:00:00.000Z"),
      },
      {
        id: "request-booking-overquota",
        source: "request",
        requestId: "request-booking-overquota",
        supervisorId: null,
        bucket: "booking",
        studentId: "student-booking-overquota",
        studentName: "MAHASISWA OVERQUOTA",
        studentIdentityNumber: "2210000003",
        thesisId: "thesis-booking-overquota",
        thesisTitle: "Judul Booking Overquota",
        roleName: "Pembimbing 1",
        requestStatus: "booking_approved",
        routeType: "escalated",
        acceptedOverNormal: true,
        createdAt: new Date("2026-07-03T00:00:00.000Z"),
      },
    ],
    pendingKadepEntries: [
      {
        id: "request-pending",
        source: "request",
        requestId: "request-pending",
        supervisorId: null,
        bucket: "pendingKadep",
        studentId: "student-pending",
        studentName: "MAHASISWA PENDING",
        studentIdentityNumber: "2210000004",
        thesisId: "thesis-pending",
        thesisTitle: "Judul Pending",
        roleName: "Pembimbing 1",
        requestStatus: "pending_kadep",
        routeType: "escalated",
        acceptedOverNormal: false,
        createdAt: new Date("2026-07-04T00:00:00.000Z"),
      },
    ],
  };
}

describe("supervisionQuota.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findAcademicYearById.mockResolvedValue({ id: ACADEMIC_YEAR_ID });
    repo.getLecturerQuotaRecord.mockResolvedValue({
      id: "quota-1",
      lecturerId: "lecturer-1",
      academicYearId: ACADEMIC_YEAR_ID,
      quotaMax: 10,
      quotaSoftLimit: 8,
      notes: "Override administratif",
    });
    getLecturerQuotaSnapshot.mockResolvedValue(createSnapshot());
    getLecturerQuotaSnapshots.mockResolvedValue([createSnapshot()]);
    syncLecturerQuotaCurrentCount.mockResolvedValue(3);
  });

  it("returns computed drill-down rows and only exposes monitoring-safe fields", async () => {
    const detail = await getLecturerQuotaDetail("lecturer-1", ACADEMIC_YEAR_ID);

    expect(getLecturerQuotaSnapshot).toHaveBeenCalledWith(
      "lecturer-1",
      ACADEMIC_YEAR_ID,
      { includeEntries: true },
    );
    expect(detail).toMatchObject({
      lecturerId: "lecturer-1",
      academicYearId: ACADEMIC_YEAR_ID,
      activeCount: 1,
      bookingCount: 2,
      pendingKadepCount: 1,
      overquotaSahCount: 1,
      notes: "Override administratif",
    });
    expect(detail.activeOfficialEntries).toHaveLength(1);
    expect(detail.bookingEntries).toHaveLength(2);
    expect(detail.pendingKadepEntries).toHaveLength(1);
    expect(detail.overquotaSahEntries).toEqual([
      expect.objectContaining({
        id: "request-booking-overquota",
        studentIdentityNumber: "2210000003",
        acceptedOverNormal: true,
      }),
    ]);
    expect(detail.activeOfficialEntries[0]).not.toHaveProperty("studentJustification");
    expect(detail.activeOfficialEntries[0]).not.toHaveProperty("lecturerOverquotaReason");
  });

  it("keeps the list endpoint on the same computed snapshot contract", async () => {
    repo.getLecturerQuotas.mockResolvedValue([
      {
        id: "lecturer-1",
        user: {
          fullName: "DR. DOSEN UJI",
          identityNumber: "19800101",
          email: "dosen@example.com",
        },
        scienceGroup: { id: "kbk-1", name: "Rekayasa Perangkat Lunak" },
        supervisionQuotas: [
          {
            id: "quota-1",
            quotaMax: 10,
            quotaSoftLimit: 8,
            currentCount: 0,
            notes: "Override administratif",
          },
        ],
      },
    ]);

    const result = await getLecturerQuotas(ACADEMIC_YEAR_ID);

    expect(getLecturerQuotaSnapshots).toHaveBeenCalledWith({
      academicYearId: ACADEMIC_YEAR_ID,
      lecturerIds: ["lecturer-1"],
    });
    expect(syncLecturerQuotaCurrentCount).toHaveBeenCalledWith("lecturer-1", ACADEMIC_YEAR_ID);
    expect(result.lecturers[0]).toMatchObject({
      lecturerId: "lecturer-1",
      academicYearId: ACADEMIC_YEAR_ID,
      currentCount: 3,
      cachedCurrentCount: 3,
      currentCountDrift: 0,
      activeCount: 1,
      bookingCount: 2,
      pendingKadepCount: 1,
      normalAvailable: 7,
      overquotaSahCount: 1,
    });
    expect(result.lecturers[0]).not.toHaveProperty("activeOfficialEntries");
  });

  it("rejects detail requests for lecturers outside the resolved snapshot", async () => {
    getLecturerQuotaSnapshot.mockResolvedValue(null);

    await expect(
      getLecturerQuotaDetail("lecturer-missing", ACADEMIC_YEAR_ID),
    ).rejects.toMatchObject({
      message: "Dosen tidak ditemukan",
    });
  });
});
