import { z } from "zod";

// ============================================
// Template Validators
// ============================================

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Nama template wajib diisi")
    .max(255, "Nama template maksimal 255 karakter"),
  description: z
    .string()
    .max(5000, "Deskripsi maksimal 5000 karakter")
    .optional()
    .nullable(),
  topicId: z.string().uuid().optional().nullable(),
  orderIndex: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  defaultDueDays: z.number().int().min(1).optional().nullable(),
  weightPercentage: z.number().int().min(0).max(100).optional().nullable(),
  isGateToAdvisorSearch: z.boolean().optional(),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const reorderTemplatesSchema = z.object({
  orders: z
    .array(
      z.object({
        id: z.string().uuid(),
        orderIndex: z.number().int().min(0),
      })
    )
    .min(1, "Minimal satu item untuk reorder"),
});

// ============================================
// Publish Tasks
// ============================================

export const publishTasksSchema = z.object({
  startDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .nullable()
    .transform((v) => v || null),
  templateDeadlines: z
    .record(z.string().uuid(), z.string().datetime({ offset: true }))
    .optional()
    .nullable()
    .transform((v) => v || null),
  studentIds: z
    .array(z.string().uuid())
    .optional()
    .nullable()
    .transform((v) => v || null),
  templateIds: z
    .array(z.string().uuid())
    .optional()
    .nullable()
    .transform((v) => v || null),
}).optional();

// ============================================
// Submit Task (Student)
// ============================================

export const submitTaskSchema = z.object({
  notes: z
    .string()
    .max(5000, "Catatan maksimal 5000 karakter")
    .optional()
    .nullable(),
});

// ============================================
// Grade Milestone (Dosen)
// ============================================

export const gradeSchema = z.object({
  status: z.enum(["completed", "revision_needed"], {
    message: "Status penilaian harus 'completed' atau 'revision_needed'",
  }),
  score: z
    .number()
    .int()
    .min(0, "Skor minimal 0")
    .max(100, "Skor maksimal 100")
    .optional()
    .nullable(),
  feedback: z
    .string()
    .max(5000, "Feedback maksimal 5000 karakter")
    .optional()
    .nullable(),
  rubricId: z.string().uuid().optional().nullable(),
});
