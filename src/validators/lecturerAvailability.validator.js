import { z } from "zod";

const dayOfWeekEnum = z.enum(["monday", "tuesday", "wednesday", "thursday", "friday"]);

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const createAvailabilitySchema = z.object({
    day: dayOfWeekEnum,
    startTime: z.string().regex(timeRegex, "Format waktu harus HH:mm"),
    endTime: z.string().regex(timeRegex, "Format waktu harus HH:mm"),
    validFrom: z.string().date("Format tanggal harus YYYY-MM-DD"),
    validUntil: z.string().date("Format tanggal harus YYYY-MM-DD"),
}).refine(
    (data) => {
        const today = new Date().toISOString().split("T")[0];
        return data.validFrom >= today;
    },
    { message: "Tanggal berlaku tidak boleh sebelum hari ini", path: ["validFrom"] }
);

export const updateAvailabilitySchema = z.object({
    day: dayOfWeekEnum.optional(),
    startTime: z.string().regex(timeRegex, "Format waktu harus HH:mm").optional(),
    endTime: z.string().regex(timeRegex, "Format waktu harus HH:mm").optional(),
    validFrom: z.string().date("Format tanggal harus YYYY-MM-DD").optional(),
    validUntil: z.string().date("Format tanggal harus YYYY-MM-DD").optional(),
});
