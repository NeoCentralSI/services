import { z } from "zod";

const reason = z
  .string({ required_error: "Alasan wajib diisi" })
  .trim()
  .min(10, "Alasan minimal 10 karakter")
  .max(2000, "Alasan maksimal 2000 karakter");

const position = z.enum(["pembimbing_1", "pembimbing_2"], {
  errorMap: () => ({ message: "Posisi pembimbing harus Pembimbing 1 atau Pembimbing 2" }),
});

/** One change request: a new title, one supervisor position, or both. */
export const submitChangeRequestSchema = z
  .object({
    thesisId: z.string().uuid().optional(),
    requestType: z.enum(["title", "supervisor", "both"], {
      errorMap: () => ({ message: "Jenis pengajuan harus Judul, Pembimbing, atau Judul dan Pembimbing" }),
    }),
    reason,
    newTitle: z.string().trim().min(5, "Judul baru minimal 5 karakter").max(1000, "Judul baru maksimal 1000 karakter").optional(),
    newTopicId: z.string().uuid("Topik tidak valid").nullable().optional(),
    supervisorRole: position.optional(),
    newSupervisorId: z.string().uuid("Pembimbing baru tidak valid").optional(),
  })
  .superRefine((data, ctx) => {
    const title = data.requestType === "title" || data.requestType === "both";
    const supervisor = data.requestType === "supervisor" || data.requestType === "both";
    if (title && !data.newTitle) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["newTitle"], message: "Judul baru wajib diisi" });
    }
    if (supervisor && !data.supervisorRole) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supervisorRole"], message: "Posisi pembimbing yang diubah wajib dipilih" });
    }
    if (supervisor && !data.newSupervisorId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["newSupervisorId"], message: "Pembimbing baru wajib dipilih" });
    }
  });

/** "Alihkan Mahasiswa": the same target lecturer and reason for several theses. */
export const submitTransferSchema = z.object({
  thesisIds: z.array(z.string().uuid()).min(1, "Pilih minimal satu mahasiswa").max(50, "Maksimal 50 mahasiswa sekaligus"),
  newSupervisorId: z.string().uuid("Dosen tujuan tidak valid"),
  reason,
});

const notes = z.string().trim().max(2000, "Catatan maksimal 2000 karakter").optional().nullable();

/** A lecturer's step, or the department's decision. Notes are required to reject. */
export const decisionSchema = z
  .object({ approve: z.boolean({ required_error: "Keputusan wajib diisi" }), notes })
  .superRefine((data, ctx) => {
    if (!data.approve && !String(data.notes ?? "").trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["notes"], message: "Alasan penolakan wajib diisi" });
    }
  });
