import { z } from "zod";

export const assignExaminersSchema = z.object({
  examinerIds: z
    .array(z.string().uuid("ID dosen penguji tidak valid"))
    .length(2, "Harus menetapkan tepat 2 penguji"),
});

export const respondAssignmentSchema = z.object({
  status: z.enum(["available", "unavailable"], {
    errorMap: () => ({
      message: "Status harus 'available' atau 'unavailable'",
    }),
  }),
});

export const submitDefenceAssessmentSchema = z.object({
  scores: z
    .array(
      z.object({
        assessmentCriteriaId: z.string().uuid("ID kriteria tidak valid"),
        score: z.number().int().min(0, "Nilai minimal 0"),
      })
    )
    .min(1, "Minimal satu nilai kriteria harus diisi"),
  revisionNotes: z.string().trim().optional().nullable(),
  supervisorNotes: z.string().trim().optional().nullable(),
});

export const finalizeDefenceSchema = z.object({
  status: z.enum(["passed", "passed_with_revision", "failed"], {
    errorMap: () => ({
      message: "Status akhir harus passed, passed_with_revision, atau failed",
    }),
  }),
});
