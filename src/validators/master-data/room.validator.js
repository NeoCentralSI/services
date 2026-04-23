import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().trim().min(1, "Nama ruangan wajib diisi").max(255, "Nama ruangan maksimal 255 karakter"),
  location: z.string().trim().max(255, "Lokasi maksimal 255 karakter").optional().nullable(),
  capacity: z.number().int().positive("Kapasitas harus lebih dari 0").optional().nullable(),
});

export const updateRoomSchema = z.object({
  name: z.string().trim().min(1, "Nama ruangan wajib diisi").max(255, "Nama ruangan maksimal 255 karakter").optional(),
  location: z.string().trim().max(255, "Lokasi maksimal 255 karakter").optional().nullable(),
  capacity: z.number().int().positive("Kapasitas harus lebih dari 0").optional().nullable(),
});
