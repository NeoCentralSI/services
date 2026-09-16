import { z } from "zod";

export const createRoomSchema = z.object({
  name: z.string().trim().min(1, "Nama ruangan wajib diisi").max(255, "Nama ruangan maksimal 255 karakter"),
  location: z.string().trim().max(255, "Lokasi ruangan maksimal 255 karakter").nullable().optional(),
  capacity: z.coerce.number().int("Kapasitas harus berupa angka bulat").positive("Kapasitas harus lebih dari 0").nullable().optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().trim().min(1, "Nama ruangan wajib diisi").max(255, "Nama ruangan maksimal 255 karakter").optional(),
  location: z.string().trim().max(255, "Lokasi ruangan maksimal 255 karakter").nullable().optional(),
  capacity: z.coerce.number().int("Kapasitas harus berupa angka bulat").positive("Kapasitas harus lebih dari 0").nullable().optional(),
});
