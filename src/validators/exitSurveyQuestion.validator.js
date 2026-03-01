import { z } from "zod";

const questionTypeEnum = z.enum(["single_choice", "multiple_choice", "text", "textarea"]);

const optionSchema = z.union([
  z.string().min(1, "Opsi tidak boleh kosong"),
  z.object({
    optionText: z.string().min(1, "Opsi tidak boleh kosong"),
    orderNumber: z.number().int().optional(),
  }),
]);

export const createExitSurveyQuestionSchema = z.object({
  question: z
    .string({ required_error: "Pertanyaan wajib diisi" })
    .min(1, "Pertanyaan tidak boleh kosong"),
  questionType: questionTypeEnum,
  isRequired: z.boolean().optional().default(false),
  orderNumber: z.number().int().min(0).optional().default(0),
  options: z.array(optionSchema).optional(),
});

export const updateExitSurveyQuestionSchema = z.object({
  question: z.string().min(1, "Pertanyaan tidak boleh kosong").optional(),
  questionType: questionTypeEnum.optional(),
  isRequired: z.boolean().optional(),
  orderNumber: z.number().int().min(0).optional(),
  options: z.array(optionSchema).optional(),
});
