import { z } from "zod";

/**
 * KaDep pengesahan TA-04. Proposal final tidak ditolak pada scope aktif; revisi
 * berjalan melalui logbook/progress sebelum proposal final disubmit.
 */
export const titleReportReviewSchema = z.object({
  action: z.enum(["accept"], {
    message: "action hanya boleh 'accept'",
  }),
  notes: z.string().max(2000).optional().nullable(),
});
