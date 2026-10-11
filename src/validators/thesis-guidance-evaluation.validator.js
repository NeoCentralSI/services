import { z } from "zod";

/** Pembimbing 1 fills an evaluation. The stage is checked against the supervision clock. */
export const submitEvaluationSchema = z.object({
  thesisId: z.string({ required_error: "Tugas akhir wajib diisi" }).uuid("Tugas akhir tidak valid"),
  stage: z.enum(["six_month", "extension_follow_up", "one_year"]).optional(),
  recommendation: z.enum(["continue", "extend_1_month", "revise_proposal", "terminate_supervision"], {
    errorMap: () => ({ message: "Keputusan pembimbing wajib dipilih" }),
  }),
  observations: z
    .object({
      noGuidance: z.boolean().optional(),
      noProgress: z.boolean().optional(),
      noResponse: z.boolean().optional(),
      noRevision: z.boolean().optional(),
    })
    .optional(),
  notes: z.string().trim().max(2000, "Keterangan maksimal 2000 karakter").optional().nullable(),
});

/** Department decision. Notes are required to reject. */
export const decisionSchema = z
  .object({
    approve: z.boolean({ required_error: "Keputusan wajib diisi" }),
    notes: z.string().trim().max(2000, "Catatan maksimal 2000 karakter").optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.approve && !String(data.notes ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Catatan wajib diisi saat menolak evaluasi" });
    }
  });
