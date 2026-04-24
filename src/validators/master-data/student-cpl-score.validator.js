import { z } from "zod";

export const createStudentCplScoreSchema = z.object({
    studentId: z.string({ required_error: "studentId wajib diisi" }).uuid("studentId tidak valid"),
    cplId: z.string({ required_error: "cplId wajib diisi" }).uuid("cplId tidak valid"),
    score: z
        .number({ required_error: "score wajib diisi" })
        .int("score harus bilangan bulat")
        .min(0, "score minimal 0")
        .max(100, "score maksimal 100"),
});

export const updateStudentCplScoreSchema = z.object({
    score: z
        .number({ required_error: "score wajib diisi" })
        .int("score harus bilangan bulat")
        .min(0, "score minimal 0")
        .max(100, "score maksimal 100"),
});
