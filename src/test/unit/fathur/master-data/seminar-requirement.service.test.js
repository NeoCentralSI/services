import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    thesisSeminarRequirement: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn((input) =>
      typeof input === "function" ? input(mockPrisma) : Promise.all(input)
    ),
  },
}));

vi.mock("../../../../config/prisma.js", () => ({ default: mockPrisma }));

import * as service from "../../../../services/seminar-requirement.service.js";

const requirementOne = {
  id: "11111111-1111-4111-8111-111111111111",
  academicYearId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Draf Laporan",
  description: "Draf final",
  displayOrder: 1,
};

const requirementTwo = {
  id: "22222222-2222-4222-8222-222222222222",
  academicYearId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Bukti Submit Jurnal",
  description: null,
  displayOrder: 3,
};

const withCount = (requirement, count = 0) => ({
  ...requirement,
  _count: { requirementDocuments: count },
});

describe("Seminar Requirement Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires an academic year when listing requirements", async () => {
    await expect(service.getAll({})).rejects.toThrow("Tahun ajaran harus dipilih");
  });

  it("returns requirements with their usage lock state", async () => {
    mockPrisma.thesisSeminarRequirement.findMany.mockResolvedValue([
      withCount(requirementOne),
      withCount(requirementTwo, 2),
    ]);

    const result = await service.getAll({
      academicYearId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });

    expect(result).toEqual([
      { ...requirementOne, hasRelatedData: false },
      { ...requirementTwo, hasRelatedData: true },
    ]);
  });

  it("creates a trimmed requirement at the next display order", async () => {
    mockPrisma.thesisSeminarRequirement.findMany.mockResolvedValue([
      withCount(requirementOne),
      withCount(requirementTwo),
    ]);
    mockPrisma.thesisSeminarRequirement.create.mockResolvedValue({ id: "new-id" });

    await service.create({
      academicYearId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "  Persyaratan Baru  ",
      description: "  Keterangan  ",
    });

    expect(mockPrisma.thesisSeminarRequirement.create).toHaveBeenCalledWith({
      data: {
        academicYearId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Persyaratan Baru",
        description: "Keterangan",
        displayOrder: 4,
      },
    });
  });

  it("allows description updates after documents have been uploaded", async () => {
    mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue(withCount(requirementOne, 1));
    mockPrisma.thesisSeminarRequirement.update.mockResolvedValue({
      ...requirementOne,
      description: "Keterangan baru",
    });

    await service.update(requirementOne.id, {
      name: requirementOne.name,
      description: "  Keterangan baru  ",
    });

    expect(mockPrisma.thesisSeminarRequirement.update).toHaveBeenCalledWith({
      where: { id: requirementOne.id },
      data: {
        name: requirementOne.name,
        description: "Keterangan baru",
      },
    });
  });

  it("locks the name after a related document exists", async () => {
    mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue(withCount(requirementOne, 1));

    await expect(
      service.update(requirementOne.id, { name: "Nama Baru" })
    ).rejects.toThrow(
      "Nama persyaratan tidak dapat diubah karena sudah memiliki dokumen yang diunggah"
    );
    expect(mockPrisma.thesisSeminarRequirement.update).not.toHaveBeenCalled();
  });

  it("deletes an unused requirement", async () => {
    mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue(withCount(requirementOne));
    mockPrisma.thesisSeminarRequirement.delete.mockResolvedValue(requirementOne);

    await service.remove(requirementOne.id);

    expect(mockPrisma.thesisSeminarRequirement.delete).toHaveBeenCalledWith({
      where: { id: requirementOne.id },
    });
  });

  it("rejects deletion after a related document exists", async () => {
    mockPrisma.thesisSeminarRequirement.findUnique.mockResolvedValue(withCount(requirementOne, 1));

    await expect(service.remove(requirementOne.id)).rejects.toThrow(
      "Persyaratan tidak dapat dihapus karena sudah memiliki dokumen yang diunggah"
    );
  });

  it("reorders the complete requirement set transactionally", async () => {
    mockPrisma.thesisSeminarRequirement.findMany.mockResolvedValue([
      withCount(requirementOne),
      withCount(requirementTwo),
    ]);
    mockPrisma.thesisSeminarRequirement.update.mockResolvedValue({});

    await service.reorder(requirementOne.academicYearId, [
      requirementTwo.id,
      requirementOne.id,
    ]);

    expect(mockPrisma.thesisSeminarRequirement.update).toHaveBeenNthCalledWith(1, {
      where: { id: requirementTwo.id },
      data: { displayOrder: 1 },
    });
    expect(mockPrisma.thesisSeminarRequirement.update).toHaveBeenNthCalledWith(2, {
      where: { id: requirementOne.id },
      data: { displayOrder: 2 },
    });
  });

  it("rejects an incomplete or cross-year reorder set", async () => {
    mockPrisma.thesisSeminarRequirement.findMany.mockResolvedValue([
      withCount(requirementOne),
      withCount(requirementTwo),
    ]);

    await expect(
      service.reorder(requirementOne.academicYearId, [requirementOne.id])
    ).rejects.toThrow(
      "Urutan persyaratan tidak valid untuk tahun ajaran yang dipilih"
    );
  });

  it("validates copy source and target years", async () => {
    await expect(service.copyTemplate(null, "target")).rejects.toThrow(
      "Tahun ajaran sumber dan tujuan harus diisi"
    );
    await expect(service.copyTemplate("same", "same")).rejects.toThrow(
      "Tahun ajaran sumber dan tujuan tidak boleh sama"
    );
  });

  it("copies only new-schema fields into an empty target year", async () => {
    const copied = {
      ...requirementOne,
      id: "33333333-3333-4333-8333-333333333333",
      academicYearId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    mockPrisma.thesisSeminarRequirement.findMany
      .mockResolvedValueOnce([requirementOne])
      .mockResolvedValueOnce([copied]);
    mockPrisma.thesisSeminarRequirement.count.mockResolvedValue(0);
    mockPrisma.thesisSeminarRequirement.createMany.mockResolvedValue({ count: 1 });

    const result = await service.copyTemplate(
      requirementOne.academicYearId,
      copied.academicYearId
    );

    expect(mockPrisma.thesisSeminarRequirement.createMany).toHaveBeenCalledWith({
      data: [{
        academicYearId: copied.academicYearId,
        name: requirementOne.name,
        description: requirementOne.description,
        displayOrder: requirementOne.displayOrder,
      }],
    });
    expect(result).toEqual([copied]);
  });

  it("refuses to overwrite requirements in the target year", async () => {
    mockPrisma.thesisSeminarRequirement.findMany.mockResolvedValue([requirementOne]);
    mockPrisma.thesisSeminarRequirement.count.mockResolvedValue(1);

    await expect(
      service.copyTemplate(
        requirementOne.academicYearId,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      )
    ).rejects.toThrow("Tahun ajaran tujuan sudah memiliki data persyaratan");
  });
});