import { z } from "zod";

/**
 * Create topic schema
 */
export const createTopicSchema = z.object({
  name: z
    .string()
    .min(1, "Nama topik wajib diisi")
    .max(255, "Nama topik maksimal 255 karakter")
    .trim(),
});

/**
 * Update topic schema
 */
export const updateTopicSchema = z.object({
  name: z
    .string()
    .min(1, "Nama topik wajib diisi")
    .max(255, "Nama topik maksimal 255 karakter")
    .trim()
    .optional(),
});

/**
 * Bulk delete topics schema
 */
export const bulkDeleteTopicsSchema = z.object({
  ids: z
    .array(z.string().uuid("ID topik harus berupa UUID yang valid"))
    .min(1, "Minimal pilih satu topik untuk dihapus"),
});
