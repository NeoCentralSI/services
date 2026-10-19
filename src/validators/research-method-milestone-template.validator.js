import { z } from "zod";

const name = z.string().trim().min(3, "Nama template minimal 3 karakter.").max(255, "Nama template maksimal 255 karakter.");
const description = z.preprocess((v) => (v === "" ? null : v), z.string().max(5000, "Deskripsi maksimal 5000 karakter.").nullable().optional());

// The shared template form sends an order as on the thesis templates.
const orderIndex = z.number().int("Urutan harus bilangan bulat.").min(0, "Urutan tidak boleh negatif.").optional();

export const createMilestoneTemplateSchema = z.object({
  name,
  description,
  isActive: z.boolean().optional(),
  orderIndex,
});

export const updateMilestoneTemplateSchema = z
  .object({ name: name.optional(), description, isActive: z.boolean().optional(), orderIndex })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: "Tidak ada perubahan yang dikirim." });

export const reorderMilestoneTemplatesSchema = z.object({
  templateIds: z.array(z.string().min(1)).min(1, "Urutan template kosong."),
});
