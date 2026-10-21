/**
 * The proposal templates are managed with the shared template panel of the thesis
 * templates, which also sends an order; without one a new template goes after the last one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { repo } = vi.hoisted(() => ({
  repo: {
    getMaxTemplateOrderIndex: vi.fn(),
    createTemplate: vi.fn(async (data, phase) => ({ id: "tpl-new", phase, ...data })),
    findTemplateById: vi.fn(async (id) => ({ id, phase: "proposal" })),
    updateTemplate: vi.fn(async (id, data) => ({ id, ...data })),
  },
}));

vi.mock("../../repositories/thesisGuidance/milestone.repository.js", () => repo);
vi.mock("../../config/prisma.js", () => ({ default: {} }));

const service = await import("../../services/research-method/milestone-template.service.js");

beforeEach(() => {
  vi.clearAllMocks();
  repo.getMaxTemplateOrderIndex.mockResolvedValue(3);
});

describe("proposal milestone templates", () => {
  it("a new template without an order goes after the last one, general and without a topic", async () => {
    const created = await service.createTemplate({ name: " Bab I - Pendahuluan ", description: "", isActive: true });
    expect(repo.createTemplate).toHaveBeenCalledWith({ name: "Bab I - Pendahuluan", description: null, topicId: null, orderIndex: 4, isActive: true }, "proposal");
    expect(created).toMatchObject({ phase: "proposal", topicId: null });
  });

  it("keeps the order given by the form", async () => {
    await service.createTemplate({ name: "Bab II", orderIndex: 0 });
    expect(repo.getMaxTemplateOrderIndex).not.toHaveBeenCalled();
    expect(repo.createTemplate.mock.calls[0][0]).toMatchObject({ orderIndex: 0 });
  });

  it("updates the order with the other fields", async () => {
    await service.updateTemplate("tpl-1", { name: "Bab III", orderIndex: 2, isActive: false });
    expect(repo.updateTemplate).toHaveBeenCalledWith("tpl-1", { name: "Bab III", orderIndex: 2, isActive: false });
  });
});
