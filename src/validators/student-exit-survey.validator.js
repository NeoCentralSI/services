import { z } from "zod";

export const submitStudentExitSurveySchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid("questionId tidak valid"),
        optionId: z.string().uuid("optionId tidak valid").optional(),
        optionIds: z.array(z.string().uuid("optionIds tidak valid")).optional(),
        answerText: z.string().optional(),
      })
    )
    .min(1, "Jawaban tidak boleh kosong"),
});
