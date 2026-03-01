import { z } from "zod";

const VALID_ROLES = ["examiner", "supervisor"];

export const defenceRoleQuery = z.object({
    role: z
        .enum(VALID_ROLES, { required_error: "Role wajib dipilih", invalid_type_error: "Role tidak valid" }),
});

export const createCriteriaSchema = z.object({
    cpmkId: z.string({ required_error: "CPMK wajib dipilih" }).uuid("CPMK tidak valid"),
    role: z.enum(VALID_ROLES, { required_error: "Role wajib dipilih" }),
    name: z
        .string()
        .trim()
        .max(255, "Nama maksimal 255 karakter")
        .optional(),
    maxScore: z
        .number({ required_error: "Skor maksimal wajib diisi" })
        .int("Skor harus berupa bilangan bulat")
        .min(1, "Skor minimal 1")
        .max(100, "Skor maksimal 100"),
});

export const updateCriteriaSchema = z.object({
    name: z
        .string()
        .trim()
        .max(255, "Nama maksimal 255 karakter")
        .optional(),
    maxScore: z
        .number()
        .int("Skor harus berupa bilangan bulat")
        .min(1, "Skor minimal 1")
        .max(100, "Skor maksimal 100")
        .optional(),
});

export const createRubricSchema = z.object({
    description: z
        .string({ required_error: "Deskripsi wajib diisi" })
        .min(1, "Deskripsi tidak boleh kosong")
        .max(1000, "Deskripsi maksimal 1000 karakter"),
    minScore: z
        .number({ required_error: "Skor minimum wajib diisi" })
        .int("Skor harus berupa bilangan bulat")
        .min(0, "Skor minimum minimal 0"),
    maxScore: z
        .number({ required_error: "Skor maksimum wajib diisi" })
        .int("Skor harus berupa bilangan bulat")
        .min(1, "Skor maksimum minimal 1"),
});

export const updateRubricSchema = z.object({
    description: z
        .string()
        .min(1, "Deskripsi tidak boleh kosong")
        .max(1000, "Deskripsi maksimal 1000 karakter")
        .optional(),
    minScore: z
        .number()
        .int("Skor harus berupa bilangan bulat")
        .min(0, "Skor minimum minimal 0")
        .optional(),
    maxScore: z
        .number()
        .int("Skor harus berupa bilangan bulat")
        .min(1, "Skor maksimum minimal 1")
        .optional(),
});

export const toggleCriteriaSchema = z.object({
    isActive: z.boolean({ required_error: "Status aktif wajib diisi" }),
});

export const reorderCriteriaSchema = z.object({
    cpmkId: z.string({ required_error: "CPMK wajib dipilih" }).uuid("CPMK tidak valid"),
    orderedIds: z
        .array(z.string().uuid("ID tidak valid"))
        .min(1, "Minimal 1 item"),
});

export const reorderRubricsSchema = z.object({
    criteriaId: z.string({ required_error: "Kriteria wajib dipilih" }).uuid("Kriteria tidak valid"),
    orderedIds: z
        .array(z.string().uuid("ID tidak valid"))
        .min(1, "Minimal 1 item"),
});
