import { z } from "zod";

// ============================================================
// Shared patterns
// ============================================================

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

// ============================================================
// Scheduling (Admin)
// ============================================================

export const scheduleSchema = z
  .object({
    roomId: z.string().uuid({ message: "roomId harus berupa UUID yang valid." }).optional().nullable(),
    isOnline: z.boolean().optional().default(false),
    meetingLink: z
      .string()
      .url({ message: "meetingLink harus berupa URL yang valid." })
      .max(255)
      .optional()
      .nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "date harus berformat YYYY-MM-DD." }),
    startTime: z.string().regex(timeRegex, { message: "startTime harus berformat HH:MM." }),
    endTime: z.string().regex(timeRegex, { message: "endTime harus berformat HH:MM." }),
  })
  .refine((data) => data.startTime < data.endTime, {
    message: "startTime harus lebih awal dari endTime.",
    path: ["endTime"],
  })
  .superRefine((data, ctx) => {
    if (data.isOnline) {
      if (!data.meetingLink) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["meetingLink"],
          message: "meetingLink wajib diisi untuk sidang daring.",
        });
      }
      return;
    }
    if (!data.roomId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roomId"],
        message: "Ruangan harus dipilih untuk sidang luring.",
      });
    }
  });

// ============================================================
// Examiners (Kadep)
// ============================================================

export const assignExaminersSchema = z.object({
  examinerIds: z
    .array(z.string().uuid("ID dosen penguji tidak valid"))
    .length(2, "Harus menetapkan tepat 2 penguji"),
});

export const respondAssignmentSchema = z.object({
  status: z.enum(["available", "unavailable"], {
    errorMap: () => ({ message: "Status harus 'available' atau 'unavailable'" }),
  }),
  unavailableReasons: z.string().optional().nullable(),
});

// ============================================================
// Assessment (Examiner / Supervisor)
// ============================================================

export const submitAssessmentSchema = z.object({
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

// ============================================================
// Finalization (Supervisor)
// ============================================================

export const finalizeDefenceSchema = z.object({
  status: z.enum(["passed", "passed_with_revision", "failed"], {
    errorMap: () => ({
      message: "Status akhir harus passed, passed_with_revision, atau failed",
    }),
  }),
});

// ============================================================
// Revisions
// ============================================================

export const createRevisionSchema = z.object({
  defenceExaminerId: z.string().uuid("ID penguji tidak valid"),
  description: z.string().trim().min(1, "Deskripsi revisi wajib diisi"),
});

export const revisionActionSchema = z
  .object({
    action: z.enum(["save_action", "submit", "cancel_submit", "approve", "unapprove"], {
      errorMap: () => ({
        message: "action harus salah satu: save_action, submit, cancel_submit, approve, unapprove",
      }),
    }),
    description: z.string().trim().min(1, "Catatan revisi wajib diisi").optional(),
    revisionAction: z.string().trim().min(1, "Perbaikan yang dilakukan wajib diisi").optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === "save_action" && !value.description && !value.revisionAction) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["description"],
        message: "Minimal isi catatan revisi atau perbaikan",
      });
    }
  });

export const createDefenceSchema = z.object({
  thesisId: z.string().uuid("thesisId harus berupa UUID yang valid."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "date harus berformat YYYY-MM-DD." }),
  roomId: z.string().uuid("roomId harus berupa UUID yang valid."),
  status: z.enum(["passed", "passed_with_revision", "failed"]),
  examinerLecturerIds: z.array(z.string().uuid()).min(1, "Minimal satu penguji harus dipilih"),
});

export const updateDefenceSchema = createDefenceSchema.partial().omit({ thesisId: true });

export const cancelDefenceSchema = z.object({
  cancelledReason: z.string().trim().optional().nullable(),
});
