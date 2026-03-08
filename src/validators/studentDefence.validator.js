import { z } from "zod";

export const createDefenceRevisionSchema = z.object({
  defenceExaminerId: z.string().uuid("ID penguji tidak valid"),
  description: z.string().trim().min(1, "Deskripsi revisi wajib diisi"),
});

export const submitDefenceRevisionActionSchema = z.object({
  revisionAction: z.string().trim().min(1, "Perbaikan yang dilakukan wajib diisi"),
});

export const saveDefenceRevisionActionSchema = z.object({
  revisionAction: z.string().trim().min(1, "Perbaikan yang dilakukan wajib diisi"),
});
