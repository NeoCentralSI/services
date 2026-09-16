import { z } from "zod";

/**
 * KaDep pengesahan TA-04: accept menyahkan judul dan menerbitkan TA-04;
 * reject mengembalikan proposal ke mahasiswa untuk revisi sesuai catatan KaDep
 * (loop: mahasiswa revisi → pembimbing telaah → re-queue ke KaDep).
 */
export const titleReportReviewSchema = z
  .object({
    action: z.enum(["accept", "reject"], {
      message: "action harus 'accept' atau 'reject'",
    }),
    notes: z.string().max(2000).optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.action === "reject" && (!data.notes || !data.notes.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notes"],
        message: "Catatan revisi wajib diisi saat menolak judul",
      });
    }
  });

export const approveRevisionAfterKadepSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
});
