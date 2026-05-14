import { describe, it, expect } from "vitest";
import { submitRequestSchema } from "../../validators/thesisChangeRequest.validator.js";

const uuid = "550e8400-e29b-41d4-a716-446655440000";
const uuid2 = "650e8400-e29b-41d4-a716-446655440001";

describe("thesisChangeRequest.validator submitRequestSchema", () => {
  it("rejects supervisor request without supportingDocumentId", () => {
    const r = submitRequestSchema.safeParse({
      requestType: "supervisor",
      reason: "x".repeat(25),
      newSupervisorId: uuid,
    });
    expect(r.success).toBe(false);
  });

  it("accepts topic request with supportingDocumentId", () => {
    const r = submitRequestSchema.safeParse({
      requestType: "topic",
      reason: "y".repeat(25),
      supportingDocumentId: uuid,
      newTitle: "Judul baru TA minimal lima",
      newTopicId: uuid2,
    });
    expect(r.success).toBe(true);
  });
});
