/**
 * Seeded readiness approvals write the same audit rows as the app, so the
 * readiness cards can show their dates.
 */
import { describe, expect, it } from "vitest";

import { AUDIT_ACTIONS, ENTITY_TYPES } from "../../services/auditLog.service.js";
import { READINESS_APPROVED_ACTION, THESIS_ENTITY, readinessApprovalRows } from "../../../scripts/lib/readiness-audit.js";

describe("seeded readiness approvals", () => {
  it("use the app's action and entity names", () => {
    expect(READINESS_APPROVED_ACTION).toEqual({
      seminar: AUDIT_ACTIONS.SEMINAR_READINESS_APPROVED,
      defence: AUDIT_ACTIONS.DEFENCE_READINESS_APPROVED,
    });
    expect(THESIS_ENTITY).toBe(ENTITY_TYPES.THESIS);
  });

  it("write one row per supervisor, Pembimbing 1 first, the last one completing readiness", () => {
    const approvedAt = new Date("2026-10-01T03:00:00.000Z");
    const rows = readinessApprovalRows({
      thesisId: "t1",
      kind: "defence",
      approvedAt,
      supervisors: [{ lecturerId: "l2", position: "pembimbing_2" }, { lecturerId: "l1", position: "pembimbing_1" }],
    });
    expect(rows).toEqual([
      {
        userId: "l1", action: "DEFENCE_READINESS_APPROVED", entity: "THESIS", entityId: "t1",
        changes: { oldValues: null, newValues: { supervisorRole: "pembimbing_1", isFullyApproved: false, notes: null }, metadata: null },
        createdAt: approvedAt,
      },
      {
        userId: "l2", action: "DEFENCE_READINESS_APPROVED", entity: "THESIS", entityId: "t1",
        changes: { oldValues: null, newValues: { supervisorRole: "pembimbing_2", isFullyApproved: true, notes: null }, metadata: null },
        createdAt: new Date(approvedAt.getTime() + 60 * 60 * 1000),
      },
    ]);
  });
});
