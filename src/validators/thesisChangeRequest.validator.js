import { z } from 'zod';

export const submitRequestSchema = z
  .object({
    requestType: z.enum(['topic', 'supervisor', 'both'], {
      errorMap: () => ({ message: 'Jenis permintaan harus salah satu dari: topic, supervisor, atau both' }),
    }),
    reason: z
      .string()
      .min(20, 'Alasan minimal 20 karakter')
      .max(1000, 'Alasan maksimal 1000 karakter'),
    supportingDocumentId: z.string().uuid('ID dokumen bukti pendukung tidak valid'),
    replaceSupervisorLecturerId: z.string().uuid().optional(),
    newTitle: z.string().min(5).max(500).optional(),
    newTopicId: z.string().min(1).optional(),
    newSupervisorId: z.string().uuid().optional(),
  })
  .refine(
    (data) => {
      if (data.requestType === 'topic') return data.newTitle && data.newTopicId;
      if (data.requestType === 'supervisor') return !!data.newSupervisorId;
      if (data.requestType === 'both') return data.newTitle && data.newTopicId && data.newSupervisorId;
      return false;
    },
    {
      message:
        'Untuk topic: newTitle dan newTopicId wajib. Untuk supervisor: newSupervisorId wajib. Untuk both: ketiganya wajib.',
    }
  );

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
