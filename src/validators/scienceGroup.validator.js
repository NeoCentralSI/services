import { z } from "zod";

const REDUNDANT_NAME_PREFIX = /^(KBK|Kelompok Bidang Keahlian|Kelompok Keilmuan)\s+/i;

export const scienceGroupNameSchema = z.object({
  name: z
    .string({ required_error: "Nama kelompok keilmuan wajib diisi" })
    .trim()
    .min(1, "Nama kelompok keilmuan wajib diisi")
    .refine((name) => !REDUNDANT_NAME_PREFIX.test(name), {
      message:
        "Nama kelompok keilmuan tidak perlu diawali 'KBK' atau 'Kelompok Keilmuan'. Gunakan nama bidangnya, misalnya Sistem Enterprise.",
    }),
});
