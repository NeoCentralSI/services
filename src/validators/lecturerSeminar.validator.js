import { z } from "zod";

export const assignExaminersSchema = z.object({
  examinerIds: z
    .array(z.string().uuid("ID dosen penguji tidak valid"))
    .length(2, "Harus menetapkan tepat 2 penguji"),
});

export const respondAssignmentSchema = z.object({
  status: z.enum(["available", "unavailable"], {
    errorMap: () => ({
      message: "Status harus 'available' atau 'unavailable'",
    }),
  }),
});
