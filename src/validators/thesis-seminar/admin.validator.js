import { z } from "zod";

const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const scheduleSchema = z.object({
  roomId: z.string().uuid({ message: "roomId harus berupa UUID yang valid." }).optional().nullable(),
  isOnline: z.boolean().optional().default(false),
  meetingLink: z.string().url({ message: "meetingLink harus berupa URL yang valid." }).max(255).optional().nullable(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "date harus berformat YYYY-MM-DD." }),
  startTime: z
    .string()
    .regex(timeRegex, { message: "startTime harus berformat HH:MM." }),
  endTime: z
    .string()
    .regex(timeRegex, { message: "endTime harus berformat HH:MM." }),
}).refine(
  (data) => data.startTime < data.endTime,
  { message: "startTime harus lebih awal dari endTime.", path: ["endTime"] }
).superRefine((data, ctx) => {
  if (data.isOnline) {
    if (!data.meetingLink) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["meetingLink"],
        message: "meetingLink wajib diisi untuk seminar daring.",
      });
    }
    return;
  }

  if (!data.roomId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["roomId"],
      message: "Ruangan harus dipilih untuk seminar luring.",
    });
  }
});

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

export const addSeminarAudienceSchema = z.object({
  studentId: z.string().uuid({ message: "studentId harus UUID valid" }),
});
