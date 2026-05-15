import { describe, it, expect, vi, beforeEach } from "vitest";
import * as service from "../../../../services/yudisium/requirement.service.js";
import * as repository from "../../../../repositories/yudisium/requirement.repository.js";

vi.mock("../../../../repositories/yudisium/requirement.repository.js");

describe("Unit Test: Yudisium Requirement Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getRequirements", () => {
    it("should return a list of formatted requirements", async () => {
      const mockData = [
        {
          id: "1",
          name: "Req 1",
          description: "Desc 1",
          isActive: true,
          isPublic: true,
          _count: { yudisiumRequirementItems: 2 },
          yudisiumRequirementItems: [
            { _count: { yudisiumParticipantRequirements: 5 } },
            { _count: { yudisiumParticipantRequirements: 3 } },
          ],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      repository.findAll.mockResolvedValue(mockData);

      const result = await service.getRequirements();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "1",
        name: "Req 1",
        eventCount: 2,
        studentCount: 8,
      });
      expect(repository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("getRequirementDetail", () => {
    it("should return formatted requirement detail if found", async () => {
      const mockItem = {
        id: "1",
        name: "Req 1",
        _count: { yudisiumRequirementItems: 2 },
        yudisiumRequirementItems: [],
      };
      repository.findById.mockResolvedValue(mockItem);

      const result = await service.getRequirementDetail("1");

      expect(result.id).toBe("1");
      expect(result.usageCount).toBe(2);
    });

    it("should throw 404 if not found", async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getRequirementDetail("999")).rejects.toThrow("tidak ditemukan");
    });
  });

  describe("createRequirement", () => {
    it("should create a new requirement if name is unique", async () => {
      const input = { name: "New Req", description: "Test" };
      repository.findByName.mockResolvedValue(null);
      repository.create.mockResolvedValue({ id: "new-id", ...input });

      const result = await service.createRequirement(input);

      expect(result.id).toBe("new-id");
      expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({
        name: "New Req",
        description: "Test",
        isActive: true,
      }));
    });

    it("should throw 409 if name already exists", async () => {
      repository.findByName.mockResolvedValue({ id: "1" });
      await expect(service.createRequirement({ name: "Exists" })).rejects.toThrow("sudah digunakan");
    });
  });

  describe("updateRequirement", () => {
    it("should update existing requirement", async () => {
      repository.findById.mockResolvedValue({ id: "1", name: "Old" });
      repository.findByName.mockResolvedValue(null);
      repository.update.mockResolvedValue({ id: "1", name: "New" });

      const result = await service.updateRequirement("1", { name: "New" });

      expect(result.name).toBe("New");
      expect(repository.update).toHaveBeenCalledWith("1", { name: "New" });
    });
  });

  describe("deleteRequirement", () => {
    it("should delete requirement if no related data", async () => {
      repository.findById.mockResolvedValue({ id: "1" });
      repository.hasRelatedData.mockResolvedValue(false);
      repository.remove.mockResolvedValue({ id: "1" });

      await service.deleteRequirement("1");

      expect(repository.remove).toHaveBeenCalledWith("1");
    });

    it("should throw 409 if has related data", async () => {
      repository.findById.mockResolvedValue({ id: "1" });
      repository.hasRelatedData.mockResolvedValue(true);

      await expect(service.deleteRequirement("1")).rejects.toThrow("memiliki data dokumen");
    });
  });
});
