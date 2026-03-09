import express from "express";
import { authGuard, requireRole, requireAnyRole } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validation.middleware.js";
import * as controller from "../controllers/thesisGuidance/topic.controller.js";
import * as validator from "../validators/topic.validator.js";
import { ROLES, LECTURER_ROLES } from "../constants/roles.js";

const router = express.Router();

/**
 * GET /api/topics
 * Get all thesis topics
 */
router.get("/", authGuard, controller.getTopics);

/**
 * GET /api/topics/my-offers
 * Get topics offered by the authenticated lecturer
 */
router.get(
  "/my-offers",
  authGuard,
  requireAnyRole(LECTURER_ROLES),
  controller.getMyOfferedTopics
);

/**
 * POST /api/topics/my-offers
 * Create a new topic offered by the authenticated lecturer
 */
router.post(
  "/my-offers",
  authGuard,
  requireAnyRole(LECTURER_ROLES),
  validate(validator.createTopicSchema),
  controller.createOfferedTopic
);

/**
 * PATCH /api/topics/my-offers/:id
 * Update a topic offered by the authenticated lecturer
 */
router.patch(
  "/my-offers/:id",
  authGuard,
  requireAnyRole(LECTURER_ROLES),
  validate(validator.updateTopicSchema),
  controller.updateOfferedTopic
);

/**
 * DELETE /api/topics/my-offers/:id
 * Delete a topic offered by the authenticated lecturer
 */
router.delete(
  "/my-offers/:id",
  authGuard,
  requireAnyRole(LECTURER_ROLES),
  controller.deleteOfferedTopic
);

/**
 * PATCH /api/topics/my-offers/:id/publish
 * Toggle publish status of a topic offered by the authenticated lecturer
 */
router.patch(
  "/my-offers/:id/publish",
  authGuard,
  requireAnyRole(LECTURER_ROLES),
  controller.togglePublishOfferedTopic
);

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
