import { z } from "zod";

export const createRevisionSchema = z.object({
  seminarExaminerId: z.string().uuid("ID penguji tidak valid"),
  description: z.string().trim().min(1, "Deskripsi revisi wajib diisi"),
});

export const submitRevisionActionSchema = z.object({
  revisionAction: z.string().trim().min(1, "Perbaikan yang dilakukan wajib diisi"),
});

export const saveRevisionActionSchema = z
  .object({
    description: z.string().trim().min(1, "Catatan revisi wajib diisi").optional(),
    revisionAction: z.string().trim().min(1, "Perbaikan yang dilakukan wajib diisi").optional(),
  })
  .refine(
    (value) => !!value.description || !!value.revisionAction,
    "Minimal isi catatan revisi atau perbaikan"
  );
