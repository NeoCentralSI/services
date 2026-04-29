import { z } from "zod";

// ============================================================
// Shared patterns
// ============================================================

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
const seminarResultStatus = z.enum(["passed", "passed_with_revision", "failed"]);

// ============================================================
// Scheduling (Admin sets date/time/room)
// ============================================================

export const scheduleSchema = z
  .object({
    roomId: z.string().uuid("roomId harus berupa UUID yang valid.").optional().nullable(),
    isOnline: z.boolean().optional().default(false),
    meetingLink: z.string().url("meetingLink harus berupa URL yang valid.").max(255).optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date harus berformat YYYY-MM-DD."),
    startTime: z.string().regex(timeRegex, "startTime harus berformat HH:MM."),
    endTime: z.string().regex(timeRegex, "endTime harus berformat HH:MM."),
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
          message: "meetingLink wajib diisi untuk seminar daring.",
        });
      }
      return;
    }
    if (!data.roomId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["roomId"],
        message: "Ruangan harus dipilih untuk seminar luring.",
      });
    }
  });

// ============================================================
// Create / Update Archive (Admin)
// ============================================================

export const createSeminarSchema = z.object({
  thesisId: z.string().uuid("thesisId harus UUID valid"),
  date: z.string().datetime("date harus datetime ISO valid"),
  roomId: z.string().uuid("roomId harus UUID valid"),
  status: seminarResultStatus,
  examinerLecturerIds: z
    .array(z.string().uuid("examinerLecturerIds harus berisi UUID valid"))
    .min(1, "Minimal 1 dosen penguji harus dipilih"),
});

export const updateSeminarSchema = z.object({
  thesisId: z.string().uuid("thesisId harus UUID valid"),
  date: z.string().datetime("date harus datetime ISO valid"),
  roomId: z.string().uuid("roomId harus UUID valid"),
  status: seminarResultStatus,
  examinerLecturerIds: z
    .array(z.string().uuid("examinerLecturerIds harus berisi UUID valid"))
    .min(1, "Minimal 1 dosen penguji harus dipilih"),
});

// ============================================================
// Audiences (Admin adds audience)
// ============================================================

export const addAudienceSchema = z.object({
  studentId: z.string().uuid("studentId harus UUID valid"),
});

// ============================================================
// Revisions (Student)
// ============================================================

export const createRevisionSchema = z.object({
  seminarExaminerId: z.string().uuid("ID penguji tidak valid"),
  description: z.string().trim().min(1, "Deskripsi revisi wajib diisi"),
});

export const revisionActionSchema = z
  .object({
    description: z.string().trim().min(1, "Catatan revisi wajib diisi").optional(),
    revisionAction: z.string().trim().min(1, "Perbaikan yang dilakukan wajib diisi").optional(),
  })
  .refine(
    (value) => !!value.description || !!value.revisionAction,
    "Minimal isi catatan revisi atau perbaikan"
  );

// ============================================================
// Examiners (Kadep)
// ============================================================

export const assignExaminersSchema = z.object({
  examinerIds: z.array(z.string().uuid("ID dosen penguji tidak valid")),
});

export const respondAssignmentSchema = z.object({
  status: z.enum(["available", "unavailable"], {
    errorMap: () => ({
      message: "Status harus 'available' atau 'unavailable'",
    }),
  }),
  unavailableReasons: z.string().optional().nullable(),
});

// ============================================================
// Assessment (Examiner)
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
});

// ============================================================
// Finalization (Supervisor)
// ============================================================

export const finalizeSeminarSchema = z.object({
  status: z.enum(["passed", "passed_with_revision", "failed"], {
    errorMap: () => ({
      message: "Status akhir harus passed, passed_with_revision, atau failed",
    }),
  }),
});
