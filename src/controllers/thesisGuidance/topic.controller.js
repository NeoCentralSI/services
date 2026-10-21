import * as topicService from "../../services/thesisGuidance/topic.service.js";

/**
 * GET /api/topics
 * Get all thesis topics
 */
export async function getTopics(req, res, next) {
  try {
    const topics = await topicService.getTopics();
    res.json({
      success: true,
      data: topics,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/topics/:id
 * Get topic by ID
 */
export async function getTopicById(req, res, next) {
  try {
    const { id } = req.params;
    const topic = await topicService.getTopicById(id);
    res.json({
      success: true,
      data: topic,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/topics
 * Create new topic (Sekretaris Departemen only)
 */
export async function createTopic(req, res, next) {
  try {
    const data = req.validated ?? req.body;
    const topic = await topicService.createTopic(req.user, data);
    res.status(201).json({
      success: true,
      message: "Topik berhasil dibuat",
      data: topic,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/topics/:id
 * Update topic (Sekretaris Departemen only)
 */
export async function updateTopic(req, res, next) {
  try {
    const { id } = req.params;
    const data = req.validated ?? req.body;
    const topic = await topicService.updateTopic(id, req.user, data);
    res.json({
      success: true,
      message: "Topik berhasil diperbarui",
      data: topic,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/topics/:id
 * Delete topic (Sekretaris Departemen only)
 */
export async function deleteTopic(req, res, next) {
  try {
    const { id } = req.params;
    const result = await topicService.deleteTopic(id, req.user);
    res.json({
      success: true,
      message: result.message,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/topics/bulk
 * Bulk delete topics (Sekretaris Departemen only)
 */
export async function bulkDeleteTopics(req, res, next) {
  try {
    const { ids } = req.validated ?? req.body;
    const result = await topicService.bulkDeleteTopics(ids, req.user);
    res.json({
      success: true,
      message: result.message,
      data: {
        deleted: result.deleted,
        failed: result.failed,
        failedNames: result.failedNames,
      },
    });
  } catch (err) {
    next(err);
  }
}
