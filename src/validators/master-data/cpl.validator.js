import { z } from "zod";

export const createCplSchema = z.object({
    code: z
        .string({ required_error: "Kode CPL wajib diisi" })
        .min(1, "Kode CPL tidak boleh kosong")
        .max(255, "Kode CPL maksimal 255 karakter"),
    description: z
        .string({ required_error: "Deskripsi wajib diisi" })
        .min(1, "Deskripsi tidak boleh kosong")
        .max(255, "Deskripsi maksimal 255 karakter"),
    minimalScore: z
        .number({ required_error: "Skor minimal wajib diisi" })
        .int("Skor minimal harus bilangan bulat")
        .min(0, "Skor minimal tidak boleh negatif")
        .max(100, "Skor minimal maksimal 100"),
});

export const updateCplSchema = z.object({
    code: z
        .string()
        .min(1, "Kode CPL tidak boleh kosong")
        .max(255, "Kode CPL maksimal 255 karakter")
        .optional(),
    description: z
        .string()
        .min(1, "Deskripsi tidak boleh kosong")
        .max(255, "Deskripsi maksimal 255 karakter")
        .optional(),
    minimalScore: z
        .number()
        .int("Skor minimal harus bilangan bulat")
        .min(0, "Skor minimal tidak boleh negatif")
        .max(100, "Skor minimal maksimal 100")
        .optional(),
});
