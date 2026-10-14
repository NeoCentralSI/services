import { z } from 'zod';

export const assignSupervisor2Schema = z.object({
  thesisId: z.string().uuid('ID thesis tidak valid'),
  lecturerId: z.string().uuid('ID dosen tidak valid'),
});
