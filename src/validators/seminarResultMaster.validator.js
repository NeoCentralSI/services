import { z } from "zod";

const seminarStatusEnum = z.enum(["passed", "passed_with_revision", "failed"]);

export const createSeminarResultSchema = z.object({
  thesisId: z.string().uuid({ message: "thesisId harus UUID valid" }),
  date: z.string().datetime({ message: "date harus datetime ISO valid" }),
  roomId: z.string().uuid({ message: "roomId harus UUID valid" }),
  status: seminarStatusEnum,
  examinerLecturerIds: z
    .array(z.string().uuid({ message: "examinerLecturerIds harus berisi UUID valid" }))
    .min(1, { message: "Minimal 1 dosen penguji harus dipilih" }),
});

export const updateSeminarResultSchema = z.object({
  thesisId: z.string().uuid({ message: "thesisId harus UUID valid" }),
  date: z.string().datetime({ message: "date harus datetime ISO valid" }),
  roomId: z.string().uuid({ message: "roomId harus UUID valid" }),
  status: seminarStatusEnum,
  examinerLecturerIds: z
    .array(z.string().uuid({ message: "examinerLecturerIds harus berisi UUID valid" }))
    .min(1, { message: "Minimal 1 dosen penguji harus dipilih" }),
});

export const assignSeminarAudienceSchema = z.object({
  studentId: z.string().uuid({ message: "studentId harus UUID valid" }),
  seminarIds: z
    .array(z.string().uuid({ message: "seminarIds harus berisi UUID valid" }))
    .min(1, { message: "Minimal 1 seminar harus dipilih" }),
});
