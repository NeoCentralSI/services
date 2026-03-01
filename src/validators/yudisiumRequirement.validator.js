import { z } from "zod";

export const createYudisiumRequirementSchema = z.object({
    name: z
        .string({ required_error: "Nama persyaratan wajib diisi" })
        .trim()
        .min(1, "Nama persyaratan tidak boleh kosong")
        .max(255, "Nama persyaratan maksimal 255 karakter"),
    description: z
        .string()
        .trim()
        .max(65535, "Deskripsi terlalu panjang")
        .nullable()
        .optional(),
    notes: z
        .string()
        .trim()
        .max(65535, "Catatan terlalu panjang")
        .nullable()
        .optional(),
    order: z
        .number()
        .int("Urutan harus bilangan bulat")
        .min(0, "Urutan minimal 0")
        .optional(),
    isActive: z.boolean().optional(),
});

export const updateYudisiumRequirementSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Nama persyaratan tidak boleh kosong")
        .max(255, "Nama persyaratan maksimal 255 karakter")
        .optional(),
    description: z
        .string()
        .trim()
        .max(65535, "Deskripsi terlalu panjang")
        .nullable()
        .optional(),
    notes: z
        .string()
        .trim()
        .max(65535, "Catatan terlalu panjang")
        .nullable()
        .optional(),
    order: z
        .number()
        .int("Urutan harus bilangan bulat")
        .min(0, "Urutan minimal 0")
        .optional(),
    isActive: z.boolean().optional(),
});
