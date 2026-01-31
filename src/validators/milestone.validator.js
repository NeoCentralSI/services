import { z } from "zod";

// ============================================
// Milestone Status Enum
// ============================================

const MilestoneStatus = z.enum([
  "not_started",
  "in_progress",
  "pending_review",
  "revision_needed",
  "completed",
]);

// ============================================
// Create Milestone Schema
// ============================================

export const createMilestoneSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(255, "Title must be less than 255 characters"),
  description: z
    .string()
    .max(5000, "Description must be less than 5000 characters")
    .optional()
    .nullable(),
  targetDate: z
    .any()
    .transform((v) => {
      if (!v) return null;
      if (v instanceof Date) return v;
      if (typeof v === "string" || typeof v === "number") {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    })
    .optional()
    .nullable(),
  orderIndex: z.number().int().min(0).optional(),
  studentNotes: z
    .string()
    .max(5000, "Student notes must be less than 5000 characters")
    .optional()
    .nullable(),
});

// ============================================
// Update Milestone Schema
// ============================================

export const updateMilestoneSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(255, "Title must be less than 255 characters")
    .optional(),
  description: z
    .string()
    .max(5000, "Description must be less than 5000 characters")
    .optional()
    .nullable(),
  targetDate: z
    .any()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      if (v instanceof Date) return v;
      if (typeof v === "string" || typeof v === "number") {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    })
    .optional()
    .nullable(),
  orderIndex: z.number().int().min(0).optional(),
  studentNotes: z
    .string()
    .max(5000, "Student notes must be less than 5000 characters")
    .optional()
    .nullable(),
  evidenceUrl: z
    .string()
    .url("Evidence URL must be a valid URL")
    .optional()
    .nullable(),
  evidenceDescription: z
    .string()
    .max(2000, "Evidence description must be less than 2000 characters")
    .optional()
    .nullable(),
});

// ============================================
// Create from Templates Schema
// ============================================

// ============================================
// Create Milestone by Supervisor Schema
// ============================================

export const createMilestoneBySupervisorSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(255, "Title must be less than 255 characters"),
  description: z
    .string()
    .max(5000, "Description must be less than 5000 characters")
    .optional()
    .nullable(),
  targetDate: z
    .any()
    .transform((v) => {
      if (!v) return null;
      if (v instanceof Date) return v;
      if (typeof v === "string" || typeof v === "number") {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    })
    .optional()
    .nullable(),
  orderIndex: z.number().int().min(0).optional(),
  supervisorNotes: z
    .string()
    .max(5000, "Supervisor notes must be less than 5000 characters")
    .optional()
    .nullable(),
});

export const createFromTemplatesSchema = z.object({
  templateIds: z
    .array(z.string().uuid("Template ID must be a valid UUID"))
    .min(1, "At least one template ID is required"),
  topicId: z
    .string()
    .uuid("Topic ID must be a valid UUID")
    .optional()
    .nullable(),
  startDate: z
    .any()
    .transform((v) => {
      if (!v) return null;
      if (v instanceof Date) return v;
      if (typeof v === "string" || typeof v === "number") {
        const d = new Date(v);
        return isNaN(d.getTime()) ? null : d;
      }
      return null;
    })
    .optional()
    .nullable(),
});

// ============================================
// Update Status Schema
// ============================================

export const updateStatusSchema = z.object({
  status: MilestoneStatus.refine(
    (val) => val !== "completed",
    "Status 'completed' can only be set by supervisor validation"
  ),
  notes: z
    .string()
    .max(2000, "Notes must be less than 2000 characters")
    .optional()
    .nullable(),
});

// ============================================
// Update Progress Schema
// ============================================

export const updateProgressSchema = z.object({
  progressPercentage: z
    .number()
    .int("Progress must be an integer")
    .min(0, "Progress must be at least 0")
    .max(100, "Progress must be at most 100"),
});

// ============================================
// Submit for Review Schema
// ============================================

export const submitForReviewSchema = z.object({
  evidenceUrl: z
    .string()
    .url("Evidence URL must be a valid URL")
    .optional()
    .nullable(),
  studentNotes: z
    .string()
    .max(5000, "Student notes must be less than 5000 characters")
    .optional()
    .nullable(),
});

// ============================================
// Validate Milestone Schema (Supervisor)
// ============================================

export const validateMilestoneSchema = z.object({
  supervisorNotes: z
    .string()
    .max(5000, "Supervisor notes must be less than 5000 characters")
    .optional()
    .nullable(),
});

// ============================================
// Request Revision Schema (Supervisor)
// ============================================

export const requestRevisionSchema = z.object({
  revisionNotes: z
    .string()
    .min(1, "Revision notes is required")
    .max(5000, "Revision notes must be less than 5000 characters"),
});

// ============================================
// Add Feedback Schema (Supervisor)
// ============================================

export const addFeedbackSchema = z.object({
  feedback: z
    .string()
    .min(1, "Feedback is required")
    .max(5000, "Feedback must be less than 5000 characters"),
});

// ============================================
// Reorder Milestones Schema
// ============================================

export const reorderMilestonesSchema = z.object({
  milestoneOrders: z
    .array(
      z.object({
        id: z.string().uuid("Milestone ID must be a valid UUID"),
        orderIndex: z.number().int().min(0),
      })
    )
    .min(1, "At least one milestone order is required"),
});

// ============================================
// Query Params Schemas
// ============================================

export const milestoneStatusQuerySchema = z.object({
  status: MilestoneStatus.optional(),
});

export const templateCategoryQuerySchema = z.object({
  category: z.string().optional(),
});

// ============================================
// Template CRUD Schemas (Sekretaris Departemen)
// ============================================

export const createTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters"),
  description: z
    .string()
    .max(5000, "Description must be less than 5000 characters")
    .optional()
    .nullable(),
  topicId: z
    .string()
    .uuid("Topic ID must be a valid UUID")
    .optional()
    .nullable(),
  orderIndex: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateTemplateSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name must be less than 255 characters")
    .optional(),
  description: z
    .string()
    .max(5000, "Description must be less than 5000 characters")
    .optional()
    .nullable(),
  topicId: z
    .string()
    .uuid("Topic ID must be a valid UUID")
    .optional()
    .nullable(),
  orderIndex: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const bulkDeleteTemplatesSchema = z.object({
  templateIds: z
    .array(z.string().uuid("Template ID must be a valid UUID"))
    .min(1, "Pilih minimal satu template untuk dihapus"),
});

// ============================================
// Seminar Readiness Approval Schemas
// ============================================

export const seminarReadinessNotesSchema = z.object({
  notes: z
    .string()
    .max(2000, "Notes must be less than 2000 characters")
    .optional()
    .nullable(),
});
