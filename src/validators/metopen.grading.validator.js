import { z } from "zod";

const criteriaScoreItem = z.object({
  criteriaId: z.string().uuid("ID kriteria tidak valid"),
  score: z.number().min(0).max(100),
});

export const supervisorScoreSchema = z.object({
  thesisId: z.string().uuid("ID Mahasiswa/Tesis tidak valid"),
  score: z
    .number()
    .min(0, "Nilai minimal 0")
    .max(100, "Nilai maksimal 100")
    .optional(),
  criteriaScores: z.array(criteriaScoreItem).optional(),
}).refine(
  (data) => data.score != null || (data.criteriaScores && data.criteriaScores.length > 0),
  { message: "Harus mengisi score atau criteriaScores" }
);

export const lecturerScoreSchema = z.object({
  thesisId: z.string().uuid("ID Mahasiswa/Tesis tidak valid"),
  score: z
    .number()
    .min(0, "Nilai minimal 0")
    .max(100, "Nilai maksimal 100")
    .optional(),
  criteriaScores: z.array(criteriaScoreItem).optional(),
}).refine(
  (data) => data.score != null || (data.criteriaScores && data.criteriaScores.length > 0),
  { message: "Harus mengisi score atau criteriaScores" }
);
