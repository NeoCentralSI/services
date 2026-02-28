import { z } from "zod";

export const createCpmkSchema = z.object({
    code: z
        .string({ required_error: "Kode CPMK wajib diisi" })
        .min(1, "Kode CPMK tidak boleh kosong")
        .max(255, "Kode CPMK maksimal 255 karakter"),
    description: z
        .string({ required_error: "Deskripsi wajib diisi" })
        .min(1, "Deskripsi tidak boleh kosong")
        .max(255, "Deskripsi maksimal 255 karakter"),
    type: z
        .enum(["research_method", "thesis"], { required_error: "Tipe CPMK wajib diisi" }),
});

export const updateCpmkSchema = z.object({
    code: z
        .string()
        .min(1, "Kode CPMK tidak boleh kosong")
        .max(255, "Kode CPMK maksimal 255 karakter")
        .optional(),
    description: z
        .string()
        .min(1, "Deskripsi tidak boleh kosong")
        .max(255, "Deskripsi maksimal 255 karakter")
        .optional(),
    type: z
        .enum(["research_method", "thesis"])
        .optional(),
});
