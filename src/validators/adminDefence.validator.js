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
        message: "meetingLink wajib diisi untuk sidang daring.",
      });
    }
    return;
  }

  if (!data.roomId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["roomId"],
      message: "Ruangan harus dipilih untuk sidang luring.",
    });
  }
});
