import { z } from "zod";

export const submitRequestSchema = z.object({
  lecturerId: z.string().min(1, "Pilih dosen pembimbing"),
  topicId: z.string().min(1, "Pilih topik penelitian"),
  proposedTitle: z.string().max(255).optional().nullable(),
  backgroundSummary: z.string().max(5000).optional().nullable(),
  justificationText: z.string().max(5000).optional().nullable(),
});

export const respondSchema = z.object({
  action: z.enum(["accept", "reject"], { message: "Action harus 'accept' atau 'reject'" }),
  rejectionReason: z.string().max(1000).optional().nullable(),
});

export const kadepDecideSchema = z.object({
  action: z.enum(["override", "redirect"], { message: "Action harus 'override' atau 'redirect'" }),
  targetLecturerId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});
