import { z } from 'zod';

export const submitEvaluationSchema = z.object({
  thesisId: z.string().uuid(),
  evaluationType: z.enum(['six_month', 'one_year']),
  recommendation: z.enum(['extend_1_month', 'revise_proposal', 'terminate_supervision']),
  notes: z.string().max(2000).optional(),
});

export const kadepReviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  kadepNotes: z.string().max(1000).optional(),
});
