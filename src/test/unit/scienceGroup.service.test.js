import { beforeEach, describe, expect, it, vi } from "vitest";
import { BadRequestError, ConflictError, NotFoundError } from "../../utils/errors.js";

const prismaMock = {
  scienceGroup: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  lecturer: { count: vi.fn() },
  thesisTopic: { count: vi.fn() },
};

vi.mock("../../config/prisma.js", () => ({ default: prismaMock }));

const {
  createScienceGroup,
  updateScienceGroup,
  deleteScienceGroup,
  normalizeScienceGroupName,
} = await import("../../services/scienceGroup.service.js");

describe("scienceGroup.service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a redundant KBK prefix instead of turning it into Sistem Informasi", () => {
    expect(() => normalizeScienceGroupName("KBK Sistem Informasi")).toThrow(BadRequestError);
    expect(() => normalizeScienceGroupName("  Sistem Enterprise  ")).not.toThrow();
    expect(normalizeScienceGroupName("  Sistem Enterprise  ")).toBe("Sistem Enterprise");
  });

  it("creates a trimmed unique name", async () => {
    prismaMock.scienceGroup.findFirst.mockResolvedValue(null);
    prismaMock.scienceGroup.create.mockResolvedValue({
      id: "sg-1",
      name: "Sistem Enterprise",
    });

    const result = await createScienceGroup({ name: "  Sistem Enterprise  " });

    expect(prismaMock.scienceGroup.findFirst).toHaveBeenCalledWith({
      where: { name: "Sistem Enterprise" },
    });
    expect(result.name).toBe("Sistem Enterprise");
  });

  it("rejects a duplicate name", async () => {
    prismaMock.scienceGroup.findFirst.mockResolvedValue({ id: "sg-other", name: "Sistem Enterprise" });
    await expect(createScienceGroup({ name: "Sistem Enterprise" })).rejects.toBeInstanceOf(ConflictError);
    expect(prismaMock.scienceGroup.create).not.toHaveBeenCalled();
  });

  it("allows renaming a row to its own current name", async () => {
    prismaMock.scienceGroup.findUnique.mockResolvedValue({ id: "sg-1", name: "Sistem Enterprise" });
    prismaMock.scienceGroup.findFirst.mockResolvedValue(null);
    prismaMock.scienceGroup.update.mockResolvedValue({ id: "sg-1", name: "Sistem Enterprise" });

    await updateScienceGroup("sg-1", { name: "Sistem Enterprise" });

    expect(prismaMock.scienceGroup.findFirst).toHaveBeenCalledWith({
      where: { name: "Sistem Enterprise", id: { not: "sg-1" } },
    });
  });

  it("rejects delete when lecturers or topics still use the group", async () => {
    prismaMock.scienceGroup.findUnique.mockResolvedValue({ id: "sg-1", name: "Sistem Enterprise" });
    prismaMock.lecturer.count.mockResolvedValue(2);
    prismaMock.thesisTopic.count.mockResolvedValue(1);

    await expect(deleteScienceGroup("sg-1")).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.scienceGroup.delete).not.toHaveBeenCalled();
  });

  it("deletes when unused by lecturers and topics", async () => {
    prismaMock.scienceGroup.findUnique.mockResolvedValue({ id: "sg-1", name: "Sistem Enterprise" });
    prismaMock.lecturer.count.mockResolvedValue(0);
    prismaMock.thesisTopic.count.mockResolvedValue(0);
    prismaMock.scienceGroup.delete.mockResolvedValue({ id: "sg-1" });

    await deleteScienceGroup("sg-1");

    expect(prismaMock.scienceGroup.delete).toHaveBeenCalledWith({ where: { id: "sg-1" } });
  });

  it("returns not found when updating a missing group", async () => {
    prismaMock.scienceGroup.findUnique.mockResolvedValue(null);
    await expect(updateScienceGroup("missing", { name: "Sistem Enterprise" })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
