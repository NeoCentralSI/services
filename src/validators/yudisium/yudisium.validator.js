import { z } from "zod";

const dateStringOrNull = z
    .string()
    .datetime({ offset: true, message: "Format tanggal tidak valid" })
    .nullable()
    .optional();

export const createYudisiumSchema = z.object({
    name: z
        .string({ required_error: "Nama yudisium wajib diisi" })
        .trim()
        .min(1, "Nama yudisium tidak boleh kosong")
        .max(255, "Nama yudisium maksimal 255 karakter"),
    registrationOpenDate: z
        .string({ required_error: "Tanggal pembukaan pendaftaran wajib diisi" })
        .datetime({ offset: true, message: "Format tanggal pembukaan pendaftaran tidak valid" }),
    registrationCloseDate: z
        .string({ required_error: "Tanggal penutupan pendaftaran wajib diisi" })
        .datetime({ offset: true, message: "Format tanggal penutupan pendaftaran tidak valid" }),
    eventDate: dateStringOrNull,
    notes: z
        .string()
        .trim()
        .max(65535, "Catatan terlalu panjang")
        .nullable()
        .optional(),
    exitSurveyFormId: z
        .string()
        .uuid("ID form exit survey tidak valid")
        .nullable()
        .optional(),
    roomId: z
        .string()
        .uuid("ID ruangan tidak valid")
        .nullable()
        .optional(),
}).superRefine((data, ctx) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openDate = new Date(data.registrationOpenDate);
    const closeDate = new Date(data.registrationCloseDate);

    if (openDate > closeDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["registrationOpenDate"],
            message: "Tanggal pembukaan pendaftaran tidak boleh lebih besar dari tanggal penutupan",
        });
    }

    if (openDate < today) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["registrationOpenDate"],
            message: "Tanggal pembukaan pendaftaran tidak boleh sebelum hari ini",
        });
    }
});

export const updateYudisiumSchema = z.object({
    name: z
        .string()
        .trim()
        .min(1, "Nama yudisium tidak boleh kosong")
        .max(255, "Nama yudisium maksimal 255 karakter")
        .optional(),
    registrationOpenDate: dateStringOrNull,
    registrationCloseDate: dateStringOrNull,
    eventDate: dateStringOrNull,
    notes: z
        .string()
        .trim()
        .max(65535, "Catatan terlalu panjang")
        .nullable()
        .optional(),
    exitSurveyFormId: z
        .string()
        .uuid("ID form exit survey tidak valid")
        .nullable()
        .optional(),
    roomId: z
        .string()
        .uuid("ID ruangan tidak valid")
        .nullable()
        .optional(),
}).superRefine((data, ctx) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const openDate = data.registrationOpenDate ? new Date(data.registrationOpenDate) : null;
    const closeDate = data.registrationCloseDate ? new Date(data.registrationCloseDate) : null;

    if (openDate && closeDate && openDate > closeDate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["registrationOpenDate"],
            message: "Tanggal pembukaan pendaftaran tidak boleh lebih besar dari tanggal penutupan",
        });
    }

    if (openDate && openDate < today) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["registrationOpenDate"],
            message: "Tanggal pembukaan pendaftaran tidak boleh sebelum hari ini",
        });
    }
});
