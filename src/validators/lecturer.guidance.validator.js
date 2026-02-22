import { z } from "zod";

export const feedbackSchema = z.object({
  feedback: z.string().min(1, "feedback is required"),
});

export const rejectGuidanceSchema = z.object({
  feedback: z.string().optional(),
  message: z.string().optional(),
});

export const approveGuidanceSchema = z.object({
  feedback: z.string().optional(),
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
