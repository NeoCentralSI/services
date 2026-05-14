import { z } from "zod/v4";

export const createClassSchema = z.object({
  name: z.string().min(1, "Nama kelas wajib diisi").max(255),
  description: z.string().max(1000).optional(),
  academicYearId: z.string().uuid().optional(),
});

export const updateClassSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const enrollStudentsSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "Minimal satu mahasiswa"),
});

export const publishToClassSchema = z.object({
  // Template ID di Prisma bertipe String; legacy data bisa non-UUID.
  templateIds: z.array(z.string().min(1, "Template ID tidak valid")).min(1, "Pilih minimal satu template"),
  templateDeadlines: z.record(z.string(), z.string()).optional(),
});

export const resolveDuplicateEnrollmentSchema = z.object({
  academicYearId: z.string().uuid().optional().nullable(),
  studentId: z.string().uuid("Student ID tidak valid"),
  keepClassId: z.string().uuid("Kelas yang dipertahankan tidak valid"),
});
