import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockRepository } = vi.hoisted(() => ({
  mockRepository: {
    findAllByLecturerId: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    findOverlapping: vi.fn(),
  },
}));

vi.mock("../../../repositories/lecturer-availability.repository.js", () => mockRepository);

import {
  getAvailabilities,
  getAvailabilityById,
  createAvailability,
  updateAvailability,
  deleteAvailability,
} from "../../../services/lecturer-availability.service.js";

const lecturerId = "lecturer-1";
const anotherLecturerId = "lecturer-2";

describe("Lecturer Availability Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T08:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("getAvailabilities: Returns records correctly ordered (by day, then start time) and validates the injected computed isActive boolean", async () => {
    mockRepository.findAllByLecturerId.mockResolvedValue([
      {
        id: "a-3",
        lecturerId,
        day: "tuesday",
        startTime: new Date("1970-01-01T13:00:00.000Z"),
        endTime: new Date("1970-01-01T15:00:00.000Z"),
        validFrom: new Date("2026-04-10T00:00:00.000Z"),
        validUntil: new Date("2026-04-30T00:00:00.000Z"),
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        id: "a-1",
        lecturerId,
        day: "monday",
        startTime: new Date("1970-01-01T10:00:00.000Z"),
        endTime: new Date("1970-01-01T12:00:00.000Z"),
        validFrom: new Date("2026-04-01T00:00:00.000Z"),
        validUntil: new Date("2026-04-19T00:00:00.000Z"),
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
      {
        id: "a-2",
        lecturerId,
        day: "monday",
        startTime: new Date("1970-01-01T08:00:00.000Z"),
        endTime: new Date("1970-01-01T09:00:00.000Z"),
        validFrom: new Date("2026-04-01T00:00:00.000Z"),
        validUntil: new Date("2026-04-25T00:00:00.000Z"),
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    ]);

    const result = await getAvailabilities(lecturerId);

    expect(result.map((x) => x.id)).toEqual(["a-2", "a-1", "a-3"]);
    expect(result.find((x) => x.id === "a-1")?.isActive).toBe(false);
    expect(result.find((x) => x.id === "a-2")?.isActive).toBe(true);
    expect(result.find((x) => x.id === "a-3")?.isActive).toBe(true);
  });

  it("getAvailabilityById: Rejects with 403 if the fetched record does not belong to the mocked authenticated lecturer", async () => {
    mockRepository.findById.mockResolvedValue({
      id: "a-1",
      lecturerId: anotherLecturerId,
      day: "monday",
      startTime: new Date("1970-01-01T08:00:00.000Z"),
      endTime: new Date("1970-01-01T09:00:00.000Z"),
      validFrom: new Date("2026-04-01T00:00:00.000Z"),
      validUntil: new Date("2026-04-30T00:00:00.000Z"),
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    });

    await expect(getAvailabilityById("a-1", lecturerId)).rejects.toMatchObject({ statusCode: 403 });
  });

  it("createAvailability: Succeeds securely with perfectly valid, non-overlapping input", async () => {
    mockRepository.findOverlapping.mockResolvedValue(null);
    mockRepository.create.mockResolvedValue({
      id: "a-new",
      lecturerId,
      day: "monday",
      startTime: new Date("1970-01-01T08:00:00.000Z"),
      endTime: new Date("1970-01-01T10:00:00.000Z"),
      validFrom: new Date("2026-04-21T00:00:00.000Z"),
      validUntil: new Date("2026-05-21T00:00:00.000Z"),
      createdAt: new Date("2026-04-20T09:00:00.000Z"),
      updatedAt: new Date("2026-04-20T09:00:00.000Z"),
    });

    const result = await createAvailability(lecturerId, {
      day: "monday",
      startTime: "08:00",
      endTime: "10:00",
      validFrom: "2026-04-21",
      validUntil: "2026-05-21",
    });

    expect(mockRepository.findOverlapping).toHaveBeenCalledTimes(1);
    expect(mockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lecturerId,
        day: "monday",
      })
    );
    expect(result).toMatchObject({ id: "a-new" });
  });

  it("createAvailability (Validation Error): Rejects with 400 when endTime is not after startTime", async () => {
    await expect(
      createAvailability(lecturerId, {
        day: "monday",
        startTime: "10:00",
        endTime: "10:00",
        validFrom: "2026-04-21",
        validUntil: "2026-05-21",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockRepository.findOverlapping).not.toHaveBeenCalled();
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it("createAvailability (Validation Error): Rejects with 400 when validUntil is not after validFrom", async () => {
    await expect(
      createAvailability(lecturerId, {
        day: "monday",
        startTime: "08:00",
        endTime: "10:00",
        validFrom: "2026-05-21",
        validUntil: "2026-05-21",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockRepository.findOverlapping).not.toHaveBeenCalled();
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it("createAvailability (Validation Error): Rejects with 400 when validFrom is in the past", async () => {
    await expect(
      createAvailability(lecturerId, {
        day: "monday",
        startTime: "08:00",
        endTime: "10:00",
        validFrom: "2026-04-19",
        validUntil: "2026-05-21",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockRepository.findOverlapping).not.toHaveBeenCalled();
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it("createAvailability (Overlap Error): Rejects with 400 when Mock detects an overlapping schedule (all 3 overlap conditions match)", async () => {
    mockRepository.findOverlapping.mockResolvedValue({
      id: "a-overlap",
      lecturerId,
      day: "monday",
    });

    await expect(
      createAvailability(lecturerId, {
        day: "monday",
        startTime: "09:00",
        endTime: "11:00",
        validFrom: "2026-04-20",
        validUntil: "2026-05-20",
      })
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(mockRepository.create).not.toHaveBeenCalled();
  });

  it("updateAvailability: Succeeds and explicitly verifies that the current record's ID is bypassed/excluded from the overlap validation check", async () => {
    mockRepository.findById.mockResolvedValue({
      id: "a-1",
      lecturerId,
      day: "monday",
      startTime: new Date("1970-01-01T08:00:00.000Z"),
      endTime: new Date("1970-01-01T10:00:00.000Z"),
      validFrom: new Date("2026-04-20T00:00:00.000Z"),
      validUntil: new Date("2026-05-20T00:00:00.000Z"),
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    mockRepository.findOverlapping.mockResolvedValue(null);
    mockRepository.update.mockResolvedValue({
      id: "a-1",
      lecturerId,
      day: "monday",
      startTime: new Date("1970-01-01T09:00:00.000Z"),
      endTime: new Date("1970-01-01T11:00:00.000Z"),
      validFrom: new Date("2026-04-01T00:00:00.000Z"),
      validUntil: new Date("2026-05-20T00:00:00.000Z"),
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-21T00:00:00.000Z"),
    });

    const result = await updateAvailability("a-1", lecturerId, {
      startTime: "09:00",
      endTime: "11:00",
      validFrom: "2026-04-01",
    });

    expect(mockRepository.findOverlapping).toHaveBeenCalledWith(
      lecturerId,
      "monday",
      expect.any(Date),
      expect.any(Date),
      expect.any(Date),
      expect.any(Date),
      "a-1"
    );
    expect(mockRepository.update).toHaveBeenCalledWith(
      "a-1",
      expect.objectContaining({
        startTime: expect.any(Date),
        endTime: expect.any(Date),
        validFrom: expect.any(Date),
      })
    );
    expect(result).toMatchObject({ id: "a-1" });
  });

  it("updateAvailability (Auth Error): Rejects with 403 if the updated record does not belong to the authenticated lecturer", async () => {
    mockRepository.findById.mockResolvedValue({
      id: "a-1",
      lecturerId: anotherLecturerId,
      day: "monday",
      startTime: new Date("1970-01-01T08:00:00.000Z"),
      endTime: new Date("1970-01-01T10:00:00.000Z"),
      validFrom: new Date("2026-04-20T00:00:00.000Z"),
      validUntil: new Date("2026-05-20T00:00:00.000Z"),
      createdAt: new Date("2026-04-01T00:00:00.000Z"),
      updatedAt: new Date("2026-04-01T00:00:00.000Z"),
    });

    await expect(
      updateAvailability("a-1", lecturerId, { endTime: "11:00" })
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(mockRepository.findOverlapping).not.toHaveBeenCalled();
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it("deleteAvailability: Succeeds unconditionally for owned records (verifying the hard delete)", async () => {
    mockRepository.findById.mockResolvedValue({
      id: "a-1",
      lecturerId,
    });
    mockRepository.remove.mockResolvedValue({ id: "a-1" });

    await deleteAvailability("a-1", lecturerId);
    expect(mockRepository.remove).toHaveBeenCalledWith("a-1");
  });

  it("deleteAvailability (Auth Error): Rejects with 403 if attempting to delete an unowned record", async () => {
    mockRepository.findById.mockResolvedValue({
      id: "a-1",
      lecturerId: anotherLecturerId,
    });

    await expect(deleteAvailability("a-1", lecturerId)).rejects.toMatchObject({ statusCode: 403 });
    expect(mockRepository.remove).not.toHaveBeenCalled();
  });
});
