import { z } from "zod";

// Small helper to validate absolute URLs
function isValidAbsoluteUrl(v) {
  try {
    const u = new URL(v);
    return !!u.protocol && !!u.host;
  } catch {
    return false;
  }
}

// Accept near-future allowing small client/server timezone or clock drift (±5 minutes)
const isFutureLoose = (d) => {
  if (!(d instanceof Date) || isNaN(d)) return false;
  const now = Date.now();
  // allow if within the last 5 minutes (to tolerate local datetime-local without TZ)
  return d.getTime() >= now - 5 * 60 * 1000;
};

export const requestGuidanceSchema = z.object({
  guidanceDate: z
    .any()
    .transform((v) => {
      if (v instanceof Date) return v;
      if (typeof v === "string" || typeof v === "number") {
        const d = new Date(v);
        return d;
      }
      return new Date(NaN);
    })
    .refine((d) => d instanceof Date && !isNaN(d), "guidanceDate must be a valid date")
    .refine(isFutureLoose, "guidanceDate must be in the near future (±5 minutes tolerance)"),
  // Allow empty string from multipart forms -> treat as undefined
  studentNotes: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().min(1))
    .optional(),
  // Optional supervisor selection; must be a valid UUID if provided
  supervisorId: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().uuid("supervisorId must be a valid UUID"))
    .optional(),
  // Optional milestone selection; must be a valid UUID if provided
  milestoneId: z
    .preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().uuid("milestoneId must be a valid UUID"))
    .optional(),
  // Optional multiple milestones (milestoneIds[] in multipart)
  milestoneIds: z
    .preprocess((v) => {
      if (Array.isArray(v)) return v;
      if (typeof v === "string" && v.trim() !== "") return [v];
      return undefined;
    }, z.array(z.string().uuid("milestoneIds must contain valid UUIDs")).optional())
    .optional(),
  // Allow empty string from multipart forms -> treat as undefined
  meetingUrl: z
    .any()
    .transform((v) => {
      if (typeof v !== "string") return undefined;
      const raw = v.trim();
      if (!raw) return undefined; // treat empty as undefined
      // If the user omits protocol, assume https://
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return withProtocol;
    })
    .refine((v) => v === undefined || isValidAbsoluteUrl(v), {
      message: "meetingUrl must be a valid URL",
    })
    .optional(),
  // Optional document URL (Google Docs, Overleaf, Notion, etc.)
  documentUrl: z
    .any()
    .transform((v) => {
      if (typeof v !== "string") return undefined;
      const raw = v.trim();
      if (!raw) return undefined;
      const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return withProtocol;
    })
    .refine((v) => v === undefined || isValidAbsoluteUrl(v), {
      message: "documentUrl must be a valid URL",
    })
    .optional(),
});

export const rescheduleGuidanceSchema = z.object({
  guidanceDate: z
    .any()
    .transform((v) => {
      if (v instanceof Date) return v;
      if (typeof v === "string" || typeof v === "number") {
        const d = new Date(v);
        return d;
      }
      return new Date(NaN);
    })
    .refine((d) => d instanceof Date && !isNaN(d), "guidanceDate must be a valid date")
    .refine(isFutureLoose, "guidanceDate must be in the near future (±5 minutes tolerance)"),
  studentNotes: z.string().min(1).optional(),
});

export const studentNotesSchema = z.object({
  studentNotes: z.string().min(1, "studentNotes is required"),
});

export const completeComponentsSchema = z.object({
  componentIds: z.array(z.string().min(1)).min(1, "componentIds cannot be empty"),
  completedAt: z.coerce.date().optional(),
});
