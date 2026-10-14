import { z } from "zod";

export const limitsSchema = z.object({
  softLimit: z.coerce.number().int("Batas lunak harus bilangan bulat."),
  hardLimit: z.coerce.number().int("Batas keras harus bilangan bulat."),
});

export const acceptingRequestsSchema = z.object({
  acceptingRequests: z.boolean({ message: "Isi acceptingRequests dengan true atau false." }),
});
