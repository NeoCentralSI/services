import { z } from 'zod';

export const assignCoAdvisorSchema = z.object({
  thesisId: z.string().uuid('ID thesis tidak valid'),
  lecturerId: z.string().uuid('ID dosen tidak valid'),
});
