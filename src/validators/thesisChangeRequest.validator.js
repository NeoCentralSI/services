import { z } from 'zod';

export const submitRequestSchema = z.object({
  requestType: z.enum(['topic', 'supervisor', 'both'], {
    errorMap: () => ({ message: 'Jenis permintaan harus salah satu dari: topic, supervisor, atau both' }),
  }),
  reason: z
    .string()
    .min(20, 'Alasan minimal 20 karakter')
    .max(1000, 'Alasan maksimal 1000 karakter'),
  newTitle: z
    .string()
    .min(5, 'Judul baru minimal 5 karakter')
    .max(500, 'Judul baru maksimal 500 karakter'),
  newTopicId: z
    .string()
    .min(1, 'Topik baru harus dipilih'),
});

export const reviewRequestSchema = z.object({
  reviewNotes: z
    .string()
    .max(1000, 'Catatan review maksimal 1000 karakter')
    .nullable()
    .optional(),
});

export const rejectRequestSchema = z.object({
  reviewNotes: z
    .string()
    .min(10, 'Catatan penolakan minimal 10 karakter')
    .max(1000, 'Catatan penolakan maksimal 1000 karakter'),
});

export const lecturerReviewSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    errorMap: () => ({ message: 'Status must be approved or rejected' })
  }),
  notes: z
    .string()
    .max(1000, 'Catatan review maksimal 1000 karakter')
    .nullable()
    .optional(),
});
