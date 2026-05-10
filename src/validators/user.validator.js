import { z } from "zod";

export const createUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email(),
  roles: z.array(z.string()).optional(),
  identityNumber: z.string().optional(),
  identityType: z.enum(["NIM", "NIP", "OTHER"]).optional(),
  gender: z.boolean().optional().nullable(),
});
export const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  email: z.string().email().optional(),
  roles: z
    .array(
      z.union([
        z.string(),
        z.object({
          name: z.string(),
          status: z.enum(["active", "nonActive"]).optional(),
        }),
      ])
    )
    .optional(),
  identityNumber: z.string().optional(),
  identityType: z.enum(["NIM", "NIP", "OTHER"]).optional(),
  isVerified: z.boolean().optional(),
  gender: z.boolean().optional().nullable(),
});