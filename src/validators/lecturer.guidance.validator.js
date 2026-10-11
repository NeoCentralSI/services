import { z } from "zod";

export const feedbackSchema = z.object({
  feedback: z.string().min(1, "feedback is required"),
});

// K19: a time "in the future" allows the same 5-minute tolerance as a student request.
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const futureDate = (message) =>
  z.preprocess(
    (v) => (v === undefined || v === null || v === "" ? undefined : new Date(v)),
    z
      .date({ error: "Waktu wajib diisi dengan format yang valid" })
      .refine((d) => !Number.isNaN(d.getTime()), "Format waktu tidak valid")
      .refine((d) => d.getTime() > Date.now() - FUTURE_TOLERANCE_MS, message),
  );

// zod 4: a missing key would report a type error in English, so it is read as "" first.
const reasonText = (label) =>
  z.preprocess(
    (v) => (v === undefined || v === null ? "" : v),
    z.string().trim().min(1, `${label} wajib diisi`).max(1000, `${label} maksimal 1000 karakter`),
  );

/**
 * K19: rejecting a request needs a reason; the lecturer may suggest another time.
 * `feedback`/`message` are accepted as aliases of `reason` for older clients.
 */
export const rejectGuidanceSchema = z
  .object({
    reason: z.string().optional(),
    feedback: z.string().optional(),
    message: z.string().optional(),
    suggestedDate: z
      .preprocess((v) => (v === "" || v === null ? undefined : v), futureDate("Usulan waktu harus di masa depan").optional()),
  })
  .transform((d) => ({ reason: (d.reason ?? d.feedback ?? d.message ?? "").trim(), suggestedDate: d.suggestedDate ?? null }))
  .pipe(
    z.object({
      reason: reasonText("Alasan penolakan"),
      suggestedDate: z.date().nullable(),
    }),
  );

/** K19: the lecturer moves an accepted session; the new time applies immediately. */
export const lecturerRescheduleGuidanceSchema = z.object({
  newDate: futureDate("Jadwal baru harus di masa depan"),
  reason: reasonText("Alasan perubahan jadwal"),
  duration: z.coerce.number().int().min(15).max(480).optional(),
});

/** K19: the lecturer asks the student to revise the session summary. */
export const rejectSummarySchema = z.object({
  notes: reasonText("Catatan perbaikan ringkasan"),
});

export const approveGuidanceSchema = z.object({
  feedback: z.string().optional(),
});

export const cancelGuidanceSchema = z.object({
  reason: reasonText("Alasan pembatalan"),
});

export const approveComponentsSchema = z.object({
  componentIds: z.array(z.string().min(1)).min(1, "componentIds cannot be empty"),
});

export const failThesisSchema = z.object({
  reason: z.string().min(1).optional(),
});

// ==================== STUDENT TRANSFER ====================

export const transferStudentsSchema = z.object({
  thesisIds: z.array(z.string().uuid("Each thesisId must be a valid UUID")).min(1, "Select at least 1 student"),
  targetLecturerId: z.string().uuid("targetLecturerId must be a valid UUID"),
  reason: z.string().min(10, "Alasan transfer minimal 10 karakter"),
});

export const rejectTransferSchema = z.object({
  reason: z.string().optional(),
});
