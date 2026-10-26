import { z } from "zod";

export const limitsSchema = z.object({
  semesterQuota: z.coerce.number().int("Kuota semester harus bilangan bulat."),
  totalLimit: z.coerce.number().int("Batas total harus bilangan bulat."),
});

export const periodQuotaSchema = limitsSchema.pick({ semesterQuota: true });

export const acceptingRequestsSchema = z.object({
  acceptingRequests: z.boolean({ message: "Isi acceptingRequests dengan true atau false." }),
});
