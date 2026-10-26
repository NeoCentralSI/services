/**
 * Every enum value in the Prisma schema has an Indonesian label, so a new
 * value cannot reach notifications, PDFs/exports or error messages without one.
 * The enum values are read from the generated client's DMMF (i.e. from schema.prisma).
 */
import { describe, expect, it } from "vitest";
import generated from "../../../generated/prisma/index.js";
import {
  THESIS_STATUS_LABELS,
  THESIS_PHASE_LABELS,
  THESIS_TERMINATION_REASON_LABELS,
  THESIS_ACTIVITY_LABELS,
  EVALUATION_DUE_LABELS,
  CHANGE_REQUEST_TYPE_LABELS,
  CHANGE_REQUEST_STATUS_LABELS,
  CHANGE_REQUEST_STEP_LABELS,
  SUPERVISOR_POSITION_LABELS,
  GUIDANCE_EVALUATION_TYPE_LABELS,
  GUIDANCE_EVALUATION_RECOMMENDATION_LABELS,
  GUIDANCE_EVALUATION_STATUS_LABELS,
  GUIDANCE_EVALUATION_OBSERVATION_LABELS,
  GUIDANCE_STATUS_LABELS,
  GUIDANCE_ACTOR_LABELS,
  MILESTONE_STATUS_LABELS,
  getThesisStatusLabel,
  getThesisActivityLabel,
  getEvaluationDueLabel,
} from "../../../constants/thesisLabels.js";
import { THESIS_STATUS, THESIS_PHASE, THESIS_TERMINATION_REASON } from "../../../constants/thesisStatus.js";
import { ACTIVITY_LEVEL, EVALUATION_DUE } from "../../../helpers/thesis-progress.helper.js";

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
    // Status sesi bimbingan, pihak pembatal, dan status milestone.
    ["GuidanceStatus", GUIDANCE_STATUS_LABELS],
    ["GuidanceActor", GUIDANCE_ACTOR_LABELS],
    ["MilestoneStatus", MILESTONE_STATUS_LABELS],
    // Pengajuan Perubahan Tugas Akhir.
    ["ThesisChangeRequestType", CHANGE_REQUEST_TYPE_LABELS],
    ["ThesisChangeRequestStatus", CHANGE_REQUEST_STATUS_LABELS],
    ["ThesisSupervisorPosition", SUPERVISOR_POSITION_LABELS],
    // Evaluasi Bimbingan.
    ["GuidanceEvaluationType", GUIDANCE_EVALUATION_TYPE_LABELS],
    ["GuidanceEvaluationRecommendation", GUIDANCE_EVALUATION_RECOMMENDATION_LABELS],
    ["GuidanceEvaluationStatus", GUIDANCE_EVALUATION_STATUS_LABELS],
  ])("setiap nilai %s punya label, dan tidak ada label untuk nilai yang tidak ada", (name, labels) => {
    const values = enumValues(name);
    expect(Object.keys(labels).sort()).toEqual([...values].sort());
    for (const value of values) {
      expect(labels[value]).toMatch(/\S/);
      expect(labels[value]).not.toBe(value);
    }
  });

  it("langkah pengajuan perubahan: setiap ThesisChangeApprovalRole dan langkah Kadep punya label", () => {
    expect(Object.keys(CHANGE_REQUEST_STEP_LABELS).sort()).toEqual([...enumValues("ThesisChangeApprovalRole"), "kadep"].sort());
    expect(CHANGE_REQUEST_STEP_LABELS).toMatchObject({
      previous_supervisor: "Pembimbing Sebelumnya",
      new_supervisor: "Pembimbing Baru",
      kadep: "Ketua Departemen",
    });
    expect(CHANGE_REQUEST_TYPE_LABELS).toEqual({ title: "Judul", supervisor: "Pembimbing", both: "Judul dan Pembimbing" });
  });

  it("evaluasi bimbingan: label keputusan dan empat observasi sesuai formulir", () => {
    expect(GUIDANCE_EVALUATION_RECOMMENDATION_LABELS).toEqual({
      continue: "Lanjut Bimbingan",
      extend_1_month: "Peringatan dan Perpanjangan 1 Bulan",
      revise_proposal: "Mengulang Proposal",
      terminate_supervision: "Dihentikan",
    });
    expect(GUIDANCE_EVALUATION_TYPE_LABELS).toEqual({ six_month: "Evaluasi 6 Bulan", one_year: "Evaluasi 1 Tahun" });
    expect(Object.keys(GUIDANCE_EVALUATION_OBSERVATION_LABELS)).toEqual(["noGuidance", "noProgress", "noResponse", "noRevision"]);
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
      completed: "Selesai",
      failed: "Gagal",
    });
    expect(THESIS_PHASE_LABELS).toEqual({ proposal: "Proposal", research: "Penelitian" });
    // Leave is a student status, shown as the "Cuti" badge beside the thesis status.
    expect(THESIS_STATUS_LABELS).not.toHaveProperty("on_leave");
  });

  it("nilai turunan (aktivitas dan jatuh tempo evaluasi) punya label untuk setiap nilai helper", () => {
    expect(Object.keys(THESIS_ACTIVITY_LABELS).sort()).toEqual(Object.values(ACTIVITY_LEVEL).sort());
    expect(THESIS_ACTIVITY_LABELS).toEqual({ active: "Lancar", slow: "Lambat", at_risk: "Berisiko" });
    expect(Object.keys(EVALUATION_DUE_LABELS).sort()).toEqual(Object.values(EVALUATION_DUE).sort());
    expect(getThesisActivityLabel("at_risk")).toBe("Berisiko");
    expect(getThesisActivityLabel(null)).toBe("-");
    expect(getEvaluationDueLabel("six_month")).toBe("Evaluasi 6 bulan jatuh tempo");
  });
});
