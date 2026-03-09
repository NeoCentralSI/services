import { z } from "zod";

export const setDefaultQuotaSchema = z.object({
	quotaMax: z
		.number({ required_error: "Quota max wajib diisi" })
		.int("Quota max harus bilangan bulat")
		.min(1, "Quota max minimal 1")
		.max(100, "Quota max maksimal 100"),
	quotaSoftLimit: z
		.number({ required_error: "Soft limit wajib diisi" })
		.int("Soft limit harus bilangan bulat")
		.min(0, "Soft limit tidak boleh negatif")
		.max(100, "Soft limit maksimal 100"),
});

export const updateLecturerQuotaSchema = z.object({
	quotaMax: z
		.number()
		.int("Quota max harus bilangan bulat")
		.min(0, "Quota max tidak boleh negatif")
		.max(100, "Quota max maksimal 100")
		.optional(),
	quotaSoftLimit: z
		.number()
		.int("Soft limit harus bilangan bulat")
		.min(0, "Soft limit tidak boleh negatif")
		.max(100, "Soft limit maksimal 100")
		.optional(),
	notes: z
		.string()
		.max(500, "Notes maksimal 500 karakter")
		.optional()
		.nullable(),
});
