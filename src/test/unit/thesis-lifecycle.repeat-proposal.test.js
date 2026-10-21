/**
 * "Mengulang proposal" (research -> proposal) is a lifecycle transition that only an
 * approved guidance evaluation can make.
 */
import { describe, expect, it, vi } from "vitest";


const {
  THESIS_STATUS_TRANSITIONS,
  REPEAT_PROPOSAL_CANCEL_REASON,
  assertStatusTransition,
  returnThesisToProposal,
  statusChangeData,
} = await import("../../services/thesisLifecycle.service.js");

function fakeTx() {
  const calls = { thesis: [], guidance: [], audit: [] };
  return {
    calls,
    thesis: { update: vi.fn(async (args) => { calls.thesis.push(args); return { id: args.where.id, ...args.data }; }) },
    thesisGuidance: { updateMany: vi.fn(async (args) => { calls.guidance.push(args); return { count: 2 }; }) },
    auditLog: { create: vi.fn(async (args) => { calls.audit.push(args); }) },
  };
}

describe("returnThesisToProposal", () => {
  it("is not reachable through the data master transition table", () => {
    expect(THESIS_STATUS_TRANSITIONS.research).not.toContain("proposal");
    expect(() => assertStatusTransition({ status: "research" }, "proposal")).toThrow(/tidak dapat diubah dari "Penelitian" ke "Proposal"/);
  });

  it("moves a research thesis back to proposal, clears the clock and cancels open sessions", async () => {
    const tx = fakeTx();
    const now = new Date("2026-10-11T05:00:00.000Z");
    const result = await returnThesisToProposal(
      tx,
      { id: "t1", status: "research", startDate: new Date("2026-01-01T00:00:00.000Z"), totalLeaveDays: 12 },
      { actorUserId: "kadep", evaluationId: "eval-1", now },
    );

    expect(tx.calls.thesis[0]).toEqual({
      where: { id: "t1" },
      data: { status: "proposal", statusChangedAt: now, startDate: null, totalLeaveDays: 0 },
    });
    expect(tx.calls.guidance[0]).toEqual({
      where: { thesisId: "t1", status: { in: ["requested", "accepted", "rescheduled", "summary_pending", "summary_rejected"] } },
      data: { status: "cancelled", cancelReason: REPEAT_PROPOSAL_CANCEL_REASON, cancelledAt: now, cancelledBy: "system" },
    });
    expect(tx.calls.audit[0].data).toMatchObject({
      userId: "kadep",
      action: "THESIS_STATUS_CHANGED",
      entityId: "t1",
      changes: { newValues: { status: "proposal", startDate: null }, metadata: { source: "guidance-evaluation", evaluationId: "eval-1", cancelledGuidances: 2 } },
    });
    expect(result.cancelledGuidances).toBe(2);
    // Supervisors are not touched: there is no supervisor write at all.
    expect(Object.keys(tx)).not.toContain("thesisSupervisors");
  });

  it.each(["proposal", "on_leave", "completed", "failed"])("refuses a thesis that is %s", async (status) => {
    const tx = fakeTx();
    await expect(returnThesisToProposal(tx, { id: "t1", status })).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.thesis.update).not.toHaveBeenCalled();
  });
});

describe("entering research starts the supervision clock when it has no start date", () => {
  const now = new Date("2026-10-11T05:00:00.000Z");

  it("sets startDate for a proposal thesis without one (e.g. after repeating the proposal)", () => {
    expect(statusChangeData({ status: "proposal", startDate: null }, "research", { now })).toMatchObject({ status: "research", startDate: now });
  });

  it("keeps an existing start date, and does not touch it for other transitions", () => {
    const startDate = new Date("2026-02-01T00:00:00.000Z");
    expect(statusChangeData({ status: "proposal", startDate }, "research", { now })).not.toHaveProperty("startDate");
    expect(statusChangeData({ status: "on_leave", startDate: null, leaveStartedAt: now }, "research", { now })).not.toHaveProperty("startDate");
  });
});
