import { z } from "zod";

export const createThesisSchema = z.object({
  studentId: z.string().uuid("Mahasiswa wajib dipilih"),
  title: z.string().min(10, "Judul minimal 10 karakter").max(500, "Judul maksimal 500 karakter"),
  thesisTopicId: z.string().uuid().nullable().optional(),
  thesisStatusId: z.string().uuid().nullable().optional(),
  academicYearId: z.string().uuid().nullable().optional(),
  supervisors: z.array(
    z.object({
      lecturerId: z.string().uuid(),
      supervisorRole: z.enum(["pembimbing_1", "pembimbing_2"]),
    })
  ).optional(),
});

export const updateThesisSchema = z.object({
  title: z.string().min(10, "Judul minimal 10 karakter").max(500, "Judul maksimal 500 karakter").optional(),
  thesisTopicId: z.string().uuid().nullable().optional(),
  thesisStatusId: z.string().uuid().nullable().optional(),
  supervisors: z.array(
    z.object({
      lecturerId: z.string().uuid(),
      supervisorRole: z.enum(["pembimbing_1", "pembimbing_2"]),
    })
  ).optional(),
});
