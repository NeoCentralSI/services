import { z } from "zod";

/** Optional text: "" becomes null. Required fields and minimum lengths are checked in the service. */
const text = (max) => z.preprocess((value) => (value === "" ? null : value), z.string().max(max).nullable().optional());

const requestFields = {
  lecturerId: text(191),
  topicId: text(191),
  proposedTitle: text(255),
  backgroundSummary: text(5000),
  problemStatement: text(5000),
  proposedSolution: text(5000),
  researchObject: text(255),
  researchPermitStatus: z
    .preprocess((value) => (value === "" ? null : value), z.enum(["approved", "in_process", "not_approved"]).nullable().optional()),
  studentJustification: text(5000),
};

export const saveDraftSchema = z.object(requestFields);
export const submitRequestSchema = z.object(requestFields);

export const lecturerResponseSchema = z.object({
  action: z.enum(["accept", "reject"], { message: "Pilih terima atau tolak." }),
  approvalNote: text(2000),
  lecturerOverquotaReason: text(2000),
  rejectionReason: text(1000),
});

export const proposalRevisionReviewSchema = z.object({
  action: z.enum(["approve", "request_revision"], { message: "Pilih setujui atau minta revisi." }),
  notes: text(2000),
});

export const kadepDecisionSchema = z.object({
  action: z.enum(["approve", "redirect", "request_revision", "reject"], {
    message: "Keputusan harus setujui, alihkan, minta revisi, atau tolak.",
  }),
  targetLecturerId: text(191),
  notes: text(2000),
});

export const issueAssignmentSchema = z.object({
  academicYearId: text(191),
});
