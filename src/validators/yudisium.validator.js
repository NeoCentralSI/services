import { z } from "zod";

// ============================================================
// Shared patterns
// ============================================================

const dateStringOrNull = z
  .string()
  .datetime({ offset: true, message: "Format tanggal tidak valid" })
  .nullable()
  .optional();

const questionTypeEnum = z.enum(["short_answer", "paragraph", "single_choice", "multiple_choice", "date"]);

const optionSchema = z.union([
  z.string().min(1, "Opsi tidak boleh kosong"),
  z.object({
    optionText: z.string().min(1, "Opsi tidak boleh kosong"),
    orderNumber: z.number().int().optional(),
  }),
]);

// ============================================================
// Yudisium Event (Create / Update)
// ============================================================

export const createYudisiumSchema = z
  .object({
    name: z
      .string({ required_error: "Nama yudisium wajib diisi" })
      .trim()
      .min(1, "Nama yudisium tidak boleh kosong")
      .max(255, "Nama yudisium maksimal 255 karakter"),
    registrationOpenDate: z
      .string({ required_error: "Tanggal pembukaan pendaftaran wajib diisi" })
      .datetime({ offset: true, message: "Format tanggal pembukaan pendaftaran tidak valid" }),
    registrationCloseDate: z
      .string({ required_error: "Tanggal penutupan pendaftaran wajib diisi" })
      .datetime({ offset: true, message: "Format tanggal penutupan pendaftaran tidak valid" }),
    eventDate: dateStringOrNull,
    notes: z.string().trim().max(65535, "Catatan terlalu panjang").nullable().optional(),
    exitSurveyFormId: z.string().uuid("ID form exit survey tidak valid").nullable().optional(),
    roomId: z.string().uuid("ID ruangan tidak valid").nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openDate = new Date(data.registrationOpenDate);
    const closeDate = new Date(data.registrationCloseDate);

    if (openDate > closeDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationOpenDate"],
        message: "Tanggal pembukaan pendaftaran tidak boleh lebih besar dari tanggal penutupan",
      });
    }

    if (openDate < today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationOpenDate"],
        message: "Tanggal pembukaan pendaftaran tidak boleh sebelum hari ini",
      });
    }
  });

export const updateYudisiumSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Nama yudisium tidak boleh kosong")
      .max(255, "Nama yudisium maksimal 255 karakter")
      .optional(),
    registrationOpenDate: dateStringOrNull,
    registrationCloseDate: dateStringOrNull,
    eventDate: dateStringOrNull,
    notes: z.string().trim().max(65535, "Catatan terlalu panjang").nullable().optional(),
    exitSurveyFormId: z.string().uuid("ID form exit survey tidak valid").nullable().optional(),
    roomId: z.string().uuid("ID ruangan tidak valid").nullable().optional(),
  })
  .superRefine((data, ctx) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openDate = data.registrationOpenDate ? new Date(data.registrationOpenDate) : null;
    const closeDate = data.registrationCloseDate ? new Date(data.registrationCloseDate) : null;

    if (openDate && closeDate && openDate > closeDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationOpenDate"],
        message: "Tanggal pembukaan pendaftaran tidak boleh lebih besar dari tanggal penutupan",
      });
    }

    if (openDate && openDate < today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationOpenDate"],
        message: "Tanggal pembukaan pendaftaran tidak boleh sebelum hari ini",
      });
    }
  });

// ============================================================
// Yudisium Requirements (Global checklist)
// ============================================================

export const createYudisiumRequirementSchema = z.object({
  name: z
    .string({ required_error: "Nama persyaratan wajib diisi" })
    .trim()
    .min(1, "Nama persyaratan tidak boleh kosong")
    .max(255, "Nama persyaratan maksimal 255 karakter"),
  description: z.string().trim().max(65535, "Deskripsi terlalu panjang").nullable().optional(),
  notes: z.string().trim().max(65535, "Catatan terlalu panjang").nullable().optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

export const updateYudisiumRequirementSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nama persyaratan tidak boleh kosong")
    .max(255, "Nama persyaratan maksimal 255 karakter")
    .optional(),
  description: z.string().trim().max(65535, "Deskripsi terlalu panjang").nullable().optional(),
  notes: z.string().trim().max(65535, "Catatan terlalu panjang").nullable().optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
});

// ============================================================
// Exit Survey Form
// ============================================================

export const createExitSurveyFormSchema = z.object({
  name: z
    .string({ required_error: "Nama form wajib diisi" })
    .min(1, "Nama form tidak boleh kosong")
    .max(255, "Nama form maksimal 255 karakter"),
  description: z.string().max(65535).optional().nullable(),
  isActive: z.boolean().optional(),
});

export const updateExitSurveyFormSchema = z.object({
  name: z
    .string()
    .min(1, "Nama form tidak boleh kosong")
    .max(255, "Nama form maksimal 255 karakter")
    .optional(),
  description: z.string().max(65535).optional().nullable(),
  isActive: z.boolean().optional(),
});

// ============================================================
// Exit Survey Question
// ============================================================

export const createExitSurveyQuestionSchema = z.object({
  question: z
    .string({ required_error: "Pertanyaan wajib diisi" })
    .min(1, "Pertanyaan tidak boleh kosong"),
  description: z.string().max(65535).optional().nullable(),
  questionType: questionTypeEnum,
  isRequired: z.boolean().optional().default(false),
  orderNumber: z.number().int().min(0).optional().default(0),
  options: z.array(optionSchema).optional(),
});

export const updateExitSurveyQuestionSchema = z.object({
  question: z.string().min(1, "Pertanyaan tidak boleh kosong").optional(),
  description: z.string().max(65535).optional().nullable(),
  questionType: questionTypeEnum.optional(),
  isRequired: z.boolean().optional(),
  orderNumber: z.number().int().min(0).optional(),
  options: z.array(optionSchema).optional(),
});

// ============================================================
// Student Exit Survey submission
// ============================================================

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
