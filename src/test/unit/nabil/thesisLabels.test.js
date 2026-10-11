/**
 * §2.2b Paket A: every enum value in the Prisma schema has an Indonesian label, so a new
 * value cannot reach notifications, PDFs/exports or error messages without one.
 * The enum values are read from the generated client's DMMF (i.e. from schema.prisma).
 */
import { describe, expect, it } from "vitest";
import generated from "../../../generated/prisma/index.js";
import {
  THESIS_STATUS_LABELS,
  THESIS_PHASE_LABELS,
  THESIS_TERMINATION_REASON_LABELS,
  THESIS_RATING_LABELS,
  GUIDANCE_STATUS_LABELS,
  GUIDANCE_ACTOR_LABELS,
  MILESTONE_STATUS_LABELS,
  getThesisStatusLabel,
  getThesisRatingLabel,
} from "../../../constants/thesisLabels.js";
import { THESIS_STATUS, THESIS_PHASE, THESIS_TERMINATION_REASON } from "../../../constants/thesisStatus.js";

const enumValues = (name) => {
  const found = generated.Prisma.dmmf.datamodel.enums.find((e) => e.name === name);
  if (!found) throw new Error(`enum ${name} tidak ada di schema`);
  return found.values.map((v) => v.name);
};

describe("label bahasa Indonesia untuk enum TA", () => {
  it.each([
    ["ThesisLifecycleStatus", THESIS_STATUS_LABELS],
    ["ThesisPhase", THESIS_PHASE_LABELS],
    ["ThesisTerminationReason", THESIS_TERMINATION_REASON_LABELS],
    ["ThesisRating", THESIS_RATING_LABELS],
    // Paket B: status sesi bimbingan, pihak pembatal, dan status milestone.
    ["GuidanceStatus", GUIDANCE_STATUS_LABELS],
    ["GuidanceActor", GUIDANCE_ACTOR_LABELS],
    ["MilestoneStatus", MILESTONE_STATUS_LABELS],
  ])("setiap nilai %s punya label, dan tidak ada label untuk nilai yang tidak ada", (name, labels) => {
    const values = enumValues(name);
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const value of values) {
      expect(labels[value]).toMatch(/\S/);
      expect(labels[value]).not.toBe(value);
    }
  });

  it("konstanta nilai enum backend sama dengan schema", () => {
    expect(Object.values(THESIS_STATUS).sort()).toEqual(enumValues("ThesisLifecycleStatus").sort());
    expect(Object.values(THESIS_PHASE).sort()).toEqual(enumValues("ThesisPhase").sort());
    expect(Object.values(THESIS_TERMINATION_REASON).sort()).toEqual(enumValues("ThesisTerminationReason").sort());
  });

  it("label sesuai §2.2b", () => {
    expect(THESIS_STATUS_LABELS).toEqual({
      proposal: "Proposal",
      research: "Penelitian",
      on_leave: "Berhenti Studi Sementara (BSS)",
      completed: "Selesai",
      failed: "Gagal",
    });
    expect(THESIS_PHASE_LABELS).toEqual({ proposal: "Proposal", research: "Tugas Akhir" });
    expect(THESIS_RATING_LABELS.ONGOING).toBe("Lancar");
    expect(getThesisStatusLabel("on_leave")).toBe("Berhenti Studi Sementara (BSS)");
    expect(getThesisRatingLabel(null)).toBe("-");
  });
});
