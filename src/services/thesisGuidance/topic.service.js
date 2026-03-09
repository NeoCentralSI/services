import * as topicRepo from "../../repositories/thesisGuidance/topic.repository.js";

// Custom errors
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 404;
  }
}

class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 403;
  }
}

class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 409;
  }
}

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}



/**
 * Get all thesis topics
 */
export async function getTopics() {
  const topics = await topicRepo.findAll();
  return topics.map((topic) => ({
    id: topic.id,
    name: topic.name,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    thesisCount: topic._count?.thesis || 0,
    templateCount: topic._count?.milestoneTemplates || 0,
  }));
}

/**
 * Get topic by ID
 */
export async function getTopicById(id) {
  const topic = await topicRepo.findById(id);
  if (!topic) {
    throw new NotFoundError("Topik tidak ditemukan");
  }

  return {
    id: topic.id,
    name: topic.name,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    thesisCount: topic._count?.thesis || 0,
    templateCount: topic._count?.milestoneTemplates || 0,
  };
}

/**
 * Create new topic (Sekretaris Departemen only)
 */
export async function createTopic(user, data) {

  // Check if name already exists
  const existing = await topicRepo.findByName(data.name.trim());
  if (existing) {
    throw new ConflictError("Topik dengan nama tersebut sudah ada");
  }

  const topic = await topicRepo.create({
    name: data.name.trim(),
  });

  return {
    id: topic.id,
    name: topic.name,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    thesisCount: 0,
    templateCount: 0,
  };
}

/**
 * Update topic (Sekretaris Departemen only)
 */
export async function updateTopic(id, user, data) {

  const existing = await topicRepo.findById(id);
  if (!existing) {
    throw new NotFoundError("Topik tidak ditemukan");
  }

  // Check if new name already exists (if name is being changed)
  if (data.name && data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = await topicRepo.findByName(data.name.trim());
    if (duplicate) {
      throw new ConflictError("Topik dengan nama tersebut sudah ada");
    }
  }

  const updateData = {};
  if (data.name) updateData.name = data.name.trim();

  const topic = await topicRepo.update(id, updateData);

  return {
    id: topic.id,
    name: topic.name,
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    thesisCount: topic._count?.thesis || 0,
    templateCount: topic._count?.milestoneTemplates || 0,
  };
}

/**
 * Delete topic (Sekretaris Departemen only)
 */
export async function deleteTopic(id, user) {

  const existing = await topicRepo.findById(id);
  if (!existing) {
    throw new NotFoundError("Topik tidak ditemukan");
  }

  // Check if topic has related data
  const hasRelated = await topicRepo.hasRelatedData(id);
  if (hasRelated) {
    throw new BadRequestError(
      "Topik tidak dapat dihapus karena masih digunakan oleh tugas akhir atau template milestone"
    );
  }

  await topicRepo.remove(id);

  return { message: "Topik berhasil dihapus" };
}

// ============================================
// Lecturer-Offered Topics (Bursa Topik Dosen)
// ============================================

/**
 * Get topics offered by the authenticated lecturer
 */
export async function getMyOfferedTopics(userId) {
  return topicRepo.findByLecturerId(userId);
}

/**
 * Create a new topic offered by the authenticated lecturer
 */
export async function createOfferedTopic(userId, data) {
  const existing = await topicRepo.findByName(data.name.trim());
  if (existing) {
    throw new ConflictError("Topik dengan nama tersebut sudah ada");
  }

  const topic = await topicRepo.create({
    name: data.name.trim(),
    description: data.description?.trim() || null,
    lecturerId: userId,
    isPublished: true,
  });

  return topic;
}

/**
 * Update a topic offered by the authenticated lecturer
 */
export async function updateOfferedTopic(id, userId, data) {
  const existing = await topicRepo.findById(id);
  if (!existing) throw new NotFoundError("Topik tidak ditemukan");
  if (existing.lecturerId !== userId) throw new ForbiddenError("Anda hanya bisa mengedit topik milik sendiri");

  if (data.name && data.name.trim().toLowerCase() !== existing.name.toLowerCase()) {
    const duplicate = await topicRepo.findByName(data.name.trim());
    if (duplicate) throw new ConflictError("Topik dengan nama tersebut sudah ada");
  }

  const updateData = {};
  if (data.name) updateData.name = data.name.trim();
  if (data.description !== undefined) updateData.description = data.description?.trim() || null;

  return topicRepo.update(id, updateData);
}

/**
 * Delete a topic offered by the authenticated lecturer
 */
export async function deleteOfferedTopic(id, userId) {
  const existing = await topicRepo.findById(id);
  if (!existing) throw new NotFoundError("Topik tidak ditemukan");
  if (existing.lecturerId !== userId) throw new ForbiddenError("Anda hanya bisa menghapus topik milik sendiri");

  const hasRelated = await topicRepo.hasRelatedData(id);
  if (hasRelated) {
    throw new BadRequestError("Topik tidak dapat dihapus karena masih digunakan");
  }

  await topicRepo.remove(id);
  return { message: "Topik berhasil dihapus" };
}

/**
 * Toggle publish status of a topic offered by the authenticated lecturer
 */
export async function togglePublishOfferedTopic(id, userId) {
  const existing = await topicRepo.findById(id);
  if (!existing) throw new NotFoundError("Topik tidak ditemukan");
  if (existing.lecturerId !== userId) throw new ForbiddenError("Anda hanya bisa mengelola topik milik sendiri");

  return topicRepo.update(id, { isPublished: !existing.isPublished });
}

/**
 * Bulk delete topics (Sekretaris Departemen only)
 */
export async function bulkDeleteTopics(ids, user) {

  // Check each topic for related data
  const cannotDelete = [];
  const canDelete = [];

  for (const id of ids) {
    const topic = await topicRepo.findById(id);
    if (!topic) continue;

    const hasRelated = await topicRepo.hasRelatedData(id);
    if (hasRelated) {
      cannotDelete.push(topic.name);
    } else {
      canDelete.push(id);
    }
  }

  if (canDelete.length > 0) {
    await topicRepo.bulkDelete(canDelete);
  }

  return {
    deleted: canDelete.length,
    failed: cannotDelete.length,
    failedNames: cannotDelete,
    message:
      cannotDelete.length > 0
        ? `${canDelete.length} topik berhasil dihapus. ${cannotDelete.length} topik gagal dihapus karena masih digunakan.`
        : `${canDelete.length} topik berhasil dihapus`,
  };
}
