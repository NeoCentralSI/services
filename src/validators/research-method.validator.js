import { z } from "zod";

/**
 * One assessor's scores. A draft may leave criteria empty (an empty draft clears it); sending needs
 * every criterion once (checked against the semester in the service). The rubric is a reference
 * on the form, not a choice, so a rubric id sent by an old client is ignored.
 */
export const submitScoreSchema = z.object({
  scores: z.array(
    z.object({
      criteriaId: z.string().min(1, "Kriteria wajib diisi."),
      rubricId: z.string().min(1).nullable().optional(),
      score: z.number({ invalid_type_error: "Skor wajib berupa angka." }),
    }),
  ),
  isDraft: z.boolean().optional(),
});

export const minimumScoreSchema = z.object({
  minimumScore: z.number({ invalid_type_error: "Nilai minimum wajib berupa angka." }).min(0, "Nilai minimum 0–100.").max(100, "Nilai minimum 0–100."),
});
