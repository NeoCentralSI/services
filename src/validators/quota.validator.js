import { z } from "zod";

export const toggleAcceptingSchema = z.object({
  acceptingRequests: z.boolean(),
});

export const setDefaultQuotaSchema = z
  .object({
    academicYearId: z.string().min(1).optional(),
    quotaMax: z.coerce.number().int().min(1).max(100),
    quotaSoftLimit: z.coerce.number().int().min(0).max(100),
  })
  .refine((data) => data.quotaSoftLimit <= data.quotaMax, {
    message: "quotaSoftLimit tidak boleh lebih besar dari quotaMax",
    path: ["quotaSoftLimit"],
  });

export const setLecturerQuotaSchema = z
  .object({
    academicYearId: z.string().min(1).optional(),
    quotaMax: z.coerce.number().int().min(1).max(100).optional(),
    quotaSoftLimit: z.coerce.number().int().min(0).max(100).optional(),
  })
  .refine((data) => data.quotaMax != null || data.quotaSoftLimit != null, {
    message: "Minimal satu field kuota harus diisi",
  })
  .refine(
    (data) =>
      data.quotaSoftLimit == null ||
      data.quotaMax == null ||
      data.quotaSoftLimit <= data.quotaMax,
    {
      message: "quotaSoftLimit tidak boleh lebih besar dari quotaMax",
      path: ["quotaSoftLimit"],
    },
  );
