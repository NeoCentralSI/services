import { z } from "zod";

/** One assessor's scores: every criterion once (checked against the period in the service). */
export const submitScoreSchema = z.object({
  scores: z
    .array(
      z.object({
        criteriaId: z.string().min(1, "Kriteria wajib diisi."),
        rubricId: z.string().min(1).nullable().optional(),
        score: z.number({ invalid_type_error: "Skor wajib berupa angka." }),
      }),
    )
    .min(1, "Nilai per kriteria wajib diisi."),
});

export const minimumScoreSchema = z.object({
  minimumScore: z.number({ invalid_type_error: "Nilai minimum wajib berupa angka." }).min(0, "Nilai minimum 0–100.").max(100, "Nilai minimum 0–100."),
});
