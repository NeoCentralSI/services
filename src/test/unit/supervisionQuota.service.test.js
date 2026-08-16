import { beforeEach, describe, expect, it, vi } from "vitest";

const repoMock = {
  findAcademicYearById: vi.fn(),
  findAcademicYearBySlug: vi.fn(),
  getLecturerQuotas: vi.fn(),
  getDefaultQuota: vi.fn(),
  getLecturerQuotaRecord: vi.fn(),
  upsertLecturerQuota: vi.fn(),
  setDefaultQuotaAndApplyToAllLecturers: vi.fn(),
};

const advisorQuotaMock = {
  getLecturerQuotaSnapshot: vi.fn(),
  getLecturerQuotaSnapshots: vi.fn(),
  syncAllLecturerQuotaCurrentCounts: vi.fn(),
  syncLecturerQuotaCurrentCount: vi.fn(),
};

vi.mock("../../repositories/supervisionQuota.repository.js", () => repoMock);
vi.mock("../../services/advisorQuota.service.js", () => advisorQuotaMock);
vi.mock("../../services/auditLog.service.js", () => ({
  logAudit: vi.fn().mockResolvedValue({ id: "audit-1" }),
  AUDIT_ACTIONS: {
    QUOTA_DEFAULT_UPDATED: "QUOTA_DEFAULT_UPDATED",
    QUOTA_LECTURER_UPDATED: "QUOTA_LECTURER_UPDATED",
  },
  ENTITY_TYPES: {
    SUPERVISION_QUOTA: "SUPERVISION_QUOTA",
    SUPERVISION_QUOTA_DEFAULT: "SUPERVISION_QUOTA_DEFAULT",
  },
}));

const { getLecturerQuotas, getDefaultQuota, setDefaultQuota, updateLecturerQuota } = await import("../../services/supervisionQuota.service.js");
const { QUOTA_LOAD_DEFINITION_LABEL } = await import("../../utils/loadScope.util.js");

describe("supervisionQuota.service getLecturerQuotas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.findAcademicYearById.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      year: "2025/2026",
      semester: "genap",
      isActive: true,
    });
    repoMock.getLecturerQuotas.mockResolvedValue([
      {
        id: "lec-1",
        user: { fullName: "Dosen A", identityNumber: "1", email: "a@x" },
        scienceGroup: { id: "sg-1", name: "RPL" },
        supervisionQuotas: [{ id: "q-1", quotaMax: 10, quotaSoftLimit: 8, currentCount: 1, notes: null }],
      },
      {
        id: "lec-2",
        user: { fullName: "Dosen B", identityNumber: "2", email: "b@x" },
        scienceGroup: { id: "sg-1", name: "RPL" },
        supervisionQuotas: [{ id: "q-2", quotaMax: 10, quotaSoftLimit: 8, currentCount: 1, notes: null }],
      },
    ]);
    advisorQuotaMock.syncLecturerQuotaCurrentCount.mockResolvedValue(4);
    advisorQuotaMock.syncAllLecturerQuotaCurrentCounts.mockResolvedValue([]);
    advisorQuotaMock.getLecturerQuotaSnapshots.mockResolvedValue([
      {
        lecturerId: "lec-1",
        fullName: "Dosen A",
        identityNumber: "1",
        email: "a@x",
        scienceGroup: { id: "sg-1", name: "RPL" },
        quotaRecordId: "q-1",
        quotaMax: 10,
        quotaSoftLimit: 8,
        currentCount: 4,
        activeCount: 3,
        bookingCount: 1,
        pendingKadepCount: 0,
        normalAvailable: 6,
        overquotaAmount: 0,
        overquotaSahCount: 0,
        isNearLimit: false,
        isFull: false,
      },
      {
        lecturerId: "lec-2",
        fullName: "Dosen B",
        identityNumber: "2",
        email: "b@x",
        scienceGroup: { id: "sg-1", name: "RPL" },
        quotaRecordId: "q-2",
        quotaMax: 10,
        quotaSoftLimit: 8,
        currentCount: 1,
        activeCount: 1,
        bookingCount: 0,
        pendingKadepCount: 0,
        normalAvailable: 9,
        overquotaAmount: 0,
        overquotaSahCount: 0,
        isNearLimit: false,
        isFull: false,
      },
    ]);
  });

  it("wraps lecturer rows with definition/period labels and KBK aggregation", async () => {
    const result = await getLecturerQuotas("11111111-1111-1111-1111-111111111111");

    expect(result.definitionLabel).toBe(QUOTA_LOAD_DEFINITION_LABEL);
    expect(result.periodLabel).toMatch(/Genap/);
    expect(result.academicYearId).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.lecturers).toHaveLength(2);
    expect(result.lecturers[0].currentCount).toBe(4);
    expect(result.kbkLoads.groups).toHaveLength(1);
    expect(result.kbkLoads.groups[0].lecturerCount).toBe(2);
    expect(result.kbkLoads.groups[0].totalLoad).toBe(5);
    expect(result.kbkLoads.groups[0].activeCount).toBe(4);
    expect(result.kbkLoads.groups[0].bookingCount).toBe(1);
    expect(result.kbkLoads.overall.averageLoad).toBe(2.5);
  });

  it("heals drifted cached counters silently and returns drift 0", async () => {
    const result = await getLecturerQuotas("11111111-1111-1111-1111-111111111111");

    expect(advisorQuotaMock.syncLecturerQuotaCurrentCount).toHaveBeenCalledTimes(1);
    expect(advisorQuotaMock.syncLecturerQuotaCurrentCount).toHaveBeenCalledWith(
      "lec-1",
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.lecturers[0]).toMatchObject({
      lecturerId: "lec-1",
      currentCount: 4,
      cachedCurrentCount: 4,
      currentCountDrift: 0,
    });
    expect(result.lecturers[1]).toMatchObject({
      lecturerId: "lec-2",
      currentCount: 1,
      cachedCurrentCount: 1,
      currentCountDrift: 0,
    });
  });

  it("does not rewrite counters when the cache already matches live load", async () => {
    repoMock.getLecturerQuotas.mockResolvedValue([
      {
        id: "lec-2",
        user: { fullName: "Dosen B", identityNumber: "2", email: "b@x" },
        scienceGroup: { id: "sg-1", name: "RPL" },
        supervisionQuotas: [{ id: "q-2", quotaMax: 10, quotaSoftLimit: 8, currentCount: 1, notes: null }],
      },
    ]);
    advisorQuotaMock.getLecturerQuotaSnapshots.mockResolvedValue([
      {
        lecturerId: "lec-2",
        fullName: "Dosen B",
        identityNumber: "2",
        email: "b@x",
        scienceGroup: { id: "sg-1", name: "RPL" },
        quotaRecordId: "q-2",
        quotaMax: 10,
        quotaSoftLimit: 8,
        currentCount: 1,
        activeCount: 1,
        bookingCount: 0,
        pendingKadepCount: 0,
        normalAvailable: 9,
        overquotaAmount: 0,
        overquotaSahCount: 0,
        isNearLimit: false,
        isFull: false,
      },
    ]);

    const result = await getLecturerQuotas("11111111-1111-1111-1111-111111111111");

    expect(advisorQuotaMock.syncLecturerQuotaCurrentCount).not.toHaveBeenCalled();
    expect(result.lecturers[0].currentCountDrift).toBe(0);
  });
});

describe("supervisionQuota.service getDefaultQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.findAcademicYearById.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      year: "2025/2026",
      semester: "genap",
      isActive: true,
    });
  });

  it("labels hardcoded 10/8 as fallback when no stored row exists", async () => {
    repoMock.getDefaultQuota.mockResolvedValue(null);

    const result = await getDefaultQuota("11111111-1111-1111-1111-111111111111");

    expect(result).toMatchObject({
      quotaMax: 10,
      quotaSoftLimit: 8,
      isFallback: true,
      source: "hardcoded_fallback",
    });
  });

  it("labels a stored row as configuration, not fallback", async () => {
    repoMock.getDefaultQuota.mockResolvedValue({
      academicYearId: "11111111-1111-1111-1111-111111111111",
      quotaMax: 12,
      quotaSoftLimit: 9,
    });

    const result = await getDefaultQuota("11111111-1111-1111-1111-111111111111");

    expect(result).toMatchObject({
      quotaMax: 12,
      quotaSoftLimit: 9,
      isFallback: false,
      source: "stored",
    });
  });
});

describe("supervisionQuota.service setDefaultQuota", () => {
  const academicYearId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.findAcademicYearById.mockResolvedValue({
      id: academicYearId,
      year: "2025/2026",
      semester: "genap",
      isActive: true,
    });
    repoMock.getDefaultQuota.mockResolvedValue(null);
    repoMock.setDefaultQuotaAndApplyToAllLecturers.mockResolvedValue({
      defaultQuota: {
        academicYearId,
        quotaMax: 10,
        quotaSoftLimit: 8,
      },
      generated: { created: 2, updated: 0, total: 2 },
    });
    advisorQuotaMock.syncAllLecturerQuotaCurrentCounts.mockResolvedValue([]);
  });

  it("rewrites stored counters after applying the default to every lecturer", async () => {
    await setDefaultQuota(academicYearId, { quotaMax: 10, quotaSoftLimit: 8 });

    expect(advisorQuotaMock.syncAllLecturerQuotaCurrentCounts).toHaveBeenCalledWith(academicYearId);
  });
});

describe("supervisionQuota.service updateLecturerQuota", () => {
  const academicYearId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    vi.clearAllMocks();
    repoMock.findAcademicYearById.mockResolvedValue({
      id: academicYearId,
      year: "2025/2026",
      semester: "genap",
      isActive: true,
    });
    advisorQuotaMock.getLecturerQuotaSnapshot.mockResolvedValue({
      lecturerId: "lec-1",
      fullName: "Dosen A",
      identityNumber: "1",
      email: "a@x",
      scienceGroup: { id: "sg-1", name: "RPL" },
      quotaRecordId: "q-new",
      quotaMax: 10,
      quotaSoftLimit: 8,
      currentCount: 3,
      activeCount: 2,
      bookingCount: 1,
      pendingKadepCount: 0,
      normalAvailable: 7,
      overquotaAmount: 0,
      overquotaSahCount: 0,
      isNearLimit: false,
      isFull: false,
    });
    repoMock.upsertLecturerQuota.mockResolvedValue({
      id: "q-new",
      lecturerId: "lec-1",
      academicYearId,
      quotaMax: 10,
      quotaSoftLimit: 8,
      currentCount: 0,
      notes: null,
    });
  });

  it("syncs live load when creating a new quota row", async () => {
    repoMock.getLecturerQuotaRecord.mockResolvedValue(null);
    advisorQuotaMock.syncLecturerQuotaCurrentCount.mockResolvedValue(3);

    const result = await updateLecturerQuota("lec-1", academicYearId, {
      quotaMax: 10,
      quotaSoftLimit: 8,
    });

    expect(advisorQuotaMock.syncLecturerQuotaCurrentCount).toHaveBeenCalledWith("lec-1", academicYearId);
    expect(result.currentCount).toBe(3);
    expect(result.cachedCurrentCount).toBe(3);
    expect(result.currentCountDrift).toBe(0);
  });

  it("does not sync when updating an existing quota row", async () => {
    repoMock.getLecturerQuotaRecord.mockResolvedValue({
      id: "q-new",
      lecturerId: "lec-1",
      academicYearId,
      quotaMax: 8,
      quotaSoftLimit: 6,
      currentCount: 3,
      notes: null,
    });
    repoMock.upsertLecturerQuota.mockResolvedValue({
      id: "q-new",
      lecturerId: "lec-1",
      academicYearId,
      quotaMax: 10,
      quotaSoftLimit: 8,
      currentCount: 3,
      notes: null,
    });

    await updateLecturerQuota("lec-1", academicYearId, { quotaMax: 10, quotaSoftLimit: 8 });

    expect(advisorQuotaMock.syncLecturerQuotaCurrentCount).not.toHaveBeenCalled();
  });
});
