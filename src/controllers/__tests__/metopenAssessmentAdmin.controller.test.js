import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../services/metopenAssessmentAdmin.service.js", () => ({
  updateCriteria: vi.fn(),
  deleteCriteria: vi.fn(),
  createRubric: vi.fn(),
  updateRubric: vi.fn(),
  deleteRubric: vi.fn(),
}));

const service = await import("../../services/metopenAssessmentAdmin.service.js");
const controller = await import("../metopenAssessmentAdmin.controller.js");

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe("metopenAssessmentAdmin.controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes criteriaId from route params when updating criteria", async () => {
    service.updateCriteria.mockResolvedValue({ id: "crit-1" });
    const res = createResponse();
    const next = vi.fn();

    await controller.updateCriteria(
      { params: { criteriaId: "crit-1" }, validated: { name: "Kriteria" } },
      res,
      next,
    );

    expect(service.updateCriteria).toHaveBeenCalledWith("crit-1", { name: "Kriteria" });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: "crit-1" } });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes criteriaId from route params when deleting criteria", async () => {
    service.deleteCriteria.mockResolvedValue({ id: "crit-1" });
    const res = createResponse();
    const next = vi.fn();

    await controller.deleteCriteria({ params: { criteriaId: "crit-1" } }, res, next);

    expect(service.deleteCriteria).toHaveBeenCalledWith("crit-1");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { id: "crit-1" } }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("passes criteriaId from route params when creating rubric", async () => {
    service.createRubric.mockResolvedValue({ id: "rubric-1" });
    const res = createResponse();
    const next = vi.fn();
    const payload = { minScore: 0, maxScore: 10, description: "Cukup" };

    await controller.createRubric(
      { params: { criteriaId: "crit-1" }, validated: payload },
      res,
      next,
    );

    expect(service.createRubric).toHaveBeenCalledWith("crit-1", payload);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: "rubric-1" } });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes rubricId from route params when updating rubric", async () => {
    service.updateRubric.mockResolvedValue({ id: "rubric-1" });
    const res = createResponse();
    const next = vi.fn();

    await controller.updateRubric(
      { params: { rubricId: "rubric-1" }, validated: { description: "Baik" } },
      res,
      next,
    );

    expect(service.updateRubric).toHaveBeenCalledWith("rubric-1", { description: "Baik" });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: "rubric-1" } });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes rubricId from route params when deleting rubric", async () => {
    service.deleteRubric.mockResolvedValue({ id: "rubric-1" });
    const res = createResponse();
    const next = vi.fn();

    await controller.deleteRubric({ params: { rubricId: "rubric-1" } }, res, next);

    expect(service.deleteRubric).toHaveBeenCalledWith("rubric-1");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { id: "rubric-1" } }),
    );
    expect(next).not.toHaveBeenCalled();
  });
});
