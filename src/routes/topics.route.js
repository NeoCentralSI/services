import express from "express";
import { authGuard, requireRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import * as controller from "../controllers/thesisGuidance/topic.controller.js";
import * as validator from "../validators/topic.validator.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

/**
 * GET /api/topics
 * Get all thesis topics
 */
router.get("/", authGuard, controller.getTopics);

/**
 * GET /api/topics/:id
 * Get topic by ID
 */
router.get("/:id", authGuard, controller.getTopicById);

/**
 * POST /api/topics
 * Create new topic (Sekretaris Departemen only)
 */
router.post(
  "/",
  authGuard,
  requireRole(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.createTopicSchema),
  controller.createTopic
);

/**
 * PATCH /api/topics/:id
 * Update topic (Sekretaris Departemen only)
 */
router.patch(
  "/:id",
  authGuard,
  requireRole(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.updateTopicSchema),
  controller.updateTopic
);

/**
 * DELETE /api/topics/bulk
 * Bulk delete topics (Sekretaris Departemen only)
 * Note: This route must come before /:id to avoid conflict
 */
router.delete(
  "/bulk",
  authGuard,
  requireRole(ROLES.SEKRETARIS_DEPARTEMEN),
  validate(validator.bulkDeleteTopicsSchema),
  controller.bulkDeleteTopics
);

/**
 * DELETE /api/topics/:id
 * Delete topic (Sekretaris Departemen only)
 */
router.delete("/:id", authGuard, requireRole(ROLES.SEKRETARIS_DEPARTEMEN), controller.deleteTopic);

export default router;
