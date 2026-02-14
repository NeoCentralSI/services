import * as thesisChangeRequestRepository from '../repositories/thesisChangeRequest.repository.js';
import prisma from '../config/prisma.js';

import { createNotificationsForUsers } from './notification.service.js';
import { sendFcmToUsers } from './push.service.js';
import { ROLES, SUPERVISOR_ROLES } from '../constants/roles.js';

// Custom errors
class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 404;
  }
}

class BadRequestError extends Error {
  constructor(message) {
    super(message);
    this.statusCode = 400;
  }
}

/**
 * Submit a thesis change request (by student)
 */
export const submitRequest = async (userId, data) => {
  const { requestType, reason } = data;

  if (requestType !== 'topic') {
    throw new BadRequestError('Hanya pergantian topik yang diperbolehkan');
  }

  // Get student's thesis
  const thesis = await prisma.thesis.findFirst({
    where: {
      student: { id: userId },
    },
    include: {
      student: {
        include: {
          user: {
            select: { id: true, fullName: true, identityNumber: true, email: true },
          },
        },
      },
      thesisTopic: true,
      thesisSupervisors: {
        include: {
          lecturer: {
            include: { user: { select: { id: true, fullName: true } } },
          },
          role: true,
        },
      },
    },
  });

  if (!thesis) {
    throw new NotFoundError('Anda belum terdaftar dalam Tugas Akhir');
  }

  // Check if there's already a pending request
  const existingPending = await thesisChangeRequestRepository.findPendingByThesisId(thesis.id);
  if (existingPending) {
    throw new BadRequestError('Anda sudah memiliki permintaan pergantian yang sedang menunggu persetujuan');
  }

  // Find supervisors (Pembimbing 1 & 2)
  const supervisors = thesis.thesisSupervisors
    .filter(p => SUPERVISOR_ROLES.includes(p.role.name))
    .map(p => ({
      lecturerId: p.lecturer.id,
      userId: p.lecturer.user.id
    }));

  // Create the request with approvals
  const request = await thesisChangeRequestRepository.create({
    thesisId: thesis.id,
    requestType,
    reason,
    approvals: {
      create: supervisors.map(s => ({
        lecturerId: s.lecturerId,
        status: 'pending'
      }))
    }
  });

  // Notify Supervisors
  if (supervisors.length > 0) {
    const supervisorUserIds = supervisors.map(s => s.userId);
    const notifTitle = 'Permintaan Pergantian Topik/Pembimbing';
    const notifMessage = `${thesis.student.user.fullName} mengajukan permintaan pergantian ${getRequestTypeLabel(requestType)}. Mohon tinjau permintaan ini.`;

    await createNotificationsForUsers(
      supervisorUserIds,
      {
        title: notifTitle,
        message: notifMessage,
        type: 'THESIS_CHANGE_REQUEST',
        referenceId: request.id,
        link: `/tugas-akhir/change-requests/${request.id}` // Lecturer link
      }
    );

    // Send FCM push notification
    await sendFcmToUsers(supervisorUserIds, {
      title: notifTitle,
      body: notifMessage,
      data: { type: 'THESIS_CHANGE_REQUEST', requestId: request.id }
    });
  }

  // Notify Kadep (Informational)
  await notifyKadepNewRequest(request);

  return flattenRequest(request); // Flatten for return
};

const flattenRequest = (req) => {
  if (req && req.thesis && req.thesis.student) {
    return {
      ...req,
      student: req.thesis.student
    };
  }
  return req;
};

/**
 * Get student's own change requests
 */
export const getMyRequests = async (userId) => {
  const thesis = await prisma.thesis.findFirst({
    where: { student: { id: userId } },
  });

  if (!thesis) {
    return [];
  }

  const requests = await thesisChangeRequestRepository.findByThesisId(thesis.id);
  return requests.map(flattenRequest);
};

/**
 * Get pending requests (for Kadep)
 */
export const getPendingRequests = async (query) => {
  const result = await thesisChangeRequestRepository.findAllPending(query);
  if (result.data) {
    result.data = result.data.map(flattenRequest);
  }
  return result;
};

/**
 * Get all requests with filters (for Kadep)
 */
export const getAllRequests = async (query) => {
  const result = await thesisChangeRequestRepository.findAll(query);
  if (result.data) {
    result.data = result.data.map(flattenRequest);
  }
  return result;
};

/**
 * Get request detail by ID
 */
export const getRequestById = async (id) => {
  const request = await thesisChangeRequestRepository.findById(id);
  if (!request) {
    throw new NotFoundError('Permintaan tidak ditemukan');
  }
  return flattenRequest(request);
};

/**
 * Approve change request (by Kadep)
 */
export const approveRequest = async (requestId, reviewerId, reviewNotes = null) => {
  const request = await thesisChangeRequestRepository.findById(requestId);
  if (!request) {
    throw new NotFoundError('Permintaan tidak ditemukan');
  }

  // Check supervisor approvals
  if (request.approvals && request.approvals.some(a => a.status !== 'approved')) {
    throw new BadRequestError('Permintaan belum disetujui oleh semua dosen pembimbing');
  }

  if (request.status !== 'pending') {
    throw new BadRequestError('Permintaan ini sudah diproses sebelumnya');
  }

  // Update request status first
  const updatedRequest = await thesisChangeRequestRepository.update(requestId, {
    status: 'approved',
    reviewedBy: reviewerId,
    reviewNotes,
    reviewedAt: new Date(),
  });

  // Archive the thesis instead of deleting
  const dibatalkanStatus = await prisma.thesisStatus.findFirst({
    where: { name: 'Dibatalkan' }
  });

  const archiveStatusId = dibatalkanStatus?.id;

  if (archiveStatusId) {
    await prisma.thesis.update({
      where: { id: request.thesisId },
      data: {
        thesisStatusId: archiveStatusId,
        title: `${request.thesis.title} (Dibatalkan)`, // Optional: append status to title
      }
    });

    // SOFT DELETE GUIDANCES & MILESTONES
    // Set status 'deleted' for all related guidances
    await prisma.thesisGuidance.updateMany({
      where: { thesisId: request.thesisId },
      data: { status: 'deleted' }
    });

    // Set status 'deleted' for all related milestones
    await prisma.thesisMilestone.updateMany({
      where: { thesisId: request.thesisId },
      data: { status: 'deleted' }
    });

  } else {
    // Fallback if status not found (should not happen if seeded)
    // Maybe log error or use 'Gagal'
    const gagalStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Gagal' } });
    if (gagalStatus) {
      await prisma.thesis.update({
        where: { id: request.thesisId },
        data: { thesisStatusId: gagalStatus.id }
      });

      // SOFT DELETE GUIDANCES & MILESTONES (Fallback case too)
      await prisma.thesisGuidance.updateMany({
        where: { thesisId: request.thesisId },
        data: { status: 'deleted' }
      });
      await prisma.thesisMilestone.updateMany({
        where: { thesisId: request.thesisId },
        data: { status: 'deleted' }
      });
    }
  }

  // Notify student
  await notifyStudentApproval(updatedRequest);

  return flattenRequest(updatedRequest);
};

/**
 * Reject change request (by Kadep)
 */
export const rejectRequest = async (requestId, reviewerId, reviewNotes) => {
  if (!reviewNotes) {
    throw new BadRequestError('Alasan penolakan harus diisi');
  }

  const request = await thesisChangeRequestRepository.findById(requestId);
  if (!request) {
    throw new NotFoundError('Permintaan tidak ditemukan');
  }

  if (request.status !== 'pending') {
    throw new BadRequestError('Permintaan ini sudah diproses sebelumnya');
  }

  const updatedRequest = await thesisChangeRequestRepository.update(requestId, {
    status: 'rejected',
    reviewedBy: reviewerId,
    reviewNotes,
    reviewedAt: new Date(),
  });

  // Notify student
  await notifyStudentRejection(updatedRequest);

  return flattenRequest(updatedRequest);
};

/**
 * Get pending request count
 */
export const getPendingCount = async () => {
  return await thesisChangeRequestRepository.countPending();
};

// Helper functions
const getRequestTypeLabel = (type) => {
  const labels = {
    topic: 'topik',
    supervisor: 'pembimbing',
    both: 'topik dan pembimbing',
  };
  return labels[type] || type;
};

const notifyKadepNewRequest = async (request) => {
  try {
    const kadepUsers = await prisma.user.findMany({
      where: {
        userHasRoles: {
          some: {
            role: { name: ROLES.KETUA_DEPARTEMEN },
            status: 'active',
          },
        },
      },
    });

    const studentName = request.thesis?.student?.user?.fullName || 'Mahasiswa';
    const typeLabel = getRequestTypeLabel(request.requestType);
    const notifTitle = 'Permintaan Pergantian TA Baru';
    const notifMessage = `${studentName} mengajukan pergantian ${typeLabel}`;

    const kadepUserIds = kadepUsers.map(k => k.id);
    if (kadepUserIds.length > 0) {
      await createNotificationsForUsers(kadepUserIds, {
        title: notifTitle,
        message: notifMessage,
      });

      // Send FCM push notification
      await sendFcmToUsers(kadepUserIds, {
        title: notifTitle,
        body: notifMessage,
        data: { type: 'THESIS_CHANGE_REQUEST_NEW', requestId: request.id }
      });
    }
  } catch (error) {
    console.error('Failed to notify Kadep:', error);
  }
};

const notifyStudentApproval = async (request) => {
  try {
    const studentUserId = request.thesis?.student?.user?.id;
    if (!studentUserId) return;

    const typeLabel = getRequestTypeLabel(request.requestType);
    const notifTitle = 'Permintaan Pergantian TA Disetujui';
    const notifMessage = `Permintaan pergantian ${typeLabel} Anda telah disetujui. Data TA lama telah dihapus, silakan daftar ulang dengan topik/pembimbing baru.`;

    await createNotificationsForUsers([studentUserId], {
      title: notifTitle,
      message: notifMessage,
    });

    // Send FCM push notification
    await sendFcmToUsers([studentUserId], {
      title: notifTitle,
      body: notifMessage,
      data: { type: 'THESIS_CHANGE_REQUEST_APPROVED' }
    });
  } catch (error) {
    console.error('Failed to notify student:', error);
  }
};

const notifyStudentRejection = async (request) => {
  try {
    const studentUserId = request.thesis?.student?.user?.id;
    if (!studentUserId) return;

    const typeLabel = getRequestTypeLabel(request.requestType);
    const notifTitle = 'Permintaan Pergantian TA Ditolak';
    const notifMessage = `Permintaan pergantian ${typeLabel} Anda ditolak. Alasan: ${request.reviewNotes}`;

    await createNotificationsForUsers([studentUserId], {
      title: notifTitle,
      message: notifMessage,
    });

    // Send FCM push notification
    await sendFcmToUsers([studentUserId], {
      title: notifTitle,
      body: notifMessage,
      data: { type: 'THESIS_CHANGE_REQUEST_REJECTED' }
    });
  } catch (error) {
    console.error('Failed to notify student:', error);
  }
};

/**
 * Review change request (by Lecturer)
 */
export const reviewRequestByLecturer = async (requestId, lecturerId, status, notes) => {
  if (!['approved', 'rejected'].includes(status)) {
    throw new BadRequestError('Status review tidak valid');
  }

  const approval = await prisma.thesisChangeRequestApproval.findUnique({
    where: {
      requestId_lecturerId: {
        requestId,
        lecturerId
      }
    },
    include: { request: { include: { thesis: { include: { student: { include: { user: true } } } } } } }
  });

  if (!approval) {
    throw new NotFoundError('Anda tidak memiliki akses untuk mereview permintaan ini');
  }

  const updatedApproval = await thesisChangeRequestRepository.updateApproval(requestId, lecturerId, status, notes);
  const request = approval.request;

  if (status === 'approved') {
    // Check if all approved
    const allApprovals = await prisma.thesisChangeRequestApproval.findMany({
      where: { requestId }
    });

    const allApproved = allApprovals.every(a => a.status === 'approved');
    if (allApproved) {
      // Notify Kadep (READY for Final Review)
      const kadepUsers = await prisma.user.findMany({
        where: { userHasRoles: { some: { role: { name: ROLES.KETUA_DEPARTEMEN }, status: 'active' } } }
      });
      const kadepUserIds = kadepUsers.map(u => u.id);

      const notifTitle = 'Permintaan Pergantian TA Siap Direview';
      const notifMessage = `Semua dosen pembimbing telah menyetujui permintaan pergantian ${getRequestTypeLabel(request.requestType)} dari ${request.thesis.student.user.fullName}. Silakan review final.`;

      if (kadepUserIds.length > 0) {
        await createNotificationsForUsers(kadepUserIds, {
          title: notifTitle,
          message: notifMessage,
          type: 'THESIS_CHANGE_REQUEST_READY',
          referenceId: request.id,
          link: `/tugas-akhir/admin/requests/${request.id}`
        });

        // Send FCM push notification
        await sendFcmToUsers(kadepUserIds, {
          title: notifTitle,
          body: notifMessage,
          data: { type: 'THESIS_CHANGE_REQUEST_READY', requestId: request.id }
        });
      }
    }
  } else if (status === 'rejected') {
    // Auto-reject request if any lecturer rejects
    await prisma.thesisChangeRequest.update({
      where: { id: requestId },
      data: {
        status: 'rejected',
        reviewedBy: null, // Rejected by system/lecturer
        reviewNotes: `Ditolak oleh dosen pembimbing: ${notes}`,
        reviewedAt: new Date()
      }
    });

    const studentUserId = request.thesis.student.user.id;
    const notifTitle = 'Permintaan Pergantian TA Ditolak';
    const notifMessage = `Permintaan pergantian Anda ditolak oleh dosen pembimbing. Alasan: ${notes}`;

    // Notify Student
    if (studentUserId) {
      await createNotificationsForUsers([studentUserId], {
        title: notifTitle,
        message: notifMessage,
        type: 'THESIS_CHANGE_REQUEST_REJECTED',
        referenceId: request.id
      });

      // Send FCM push notification
      await sendFcmToUsers([studentUserId], {
        title: notifTitle,
        body: notifMessage,
        data: { type: 'THESIS_CHANGE_REQUEST_REJECTED', requestId: request.id }
      });
    }
  }

  return updatedApproval;
};

/**
 * Get pending change request for a specific thesis that requires lecturer review
 */
export const getPendingRequestForLecturer = async (thesisId, lecturerId) => {
  return await thesisChangeRequestRepository.findPendingForLecturerByThesisId(thesisId, lecturerId);
};

/**
 * Check if student has an approved change request where thesis was deleted
 * Used to show "please re-register" message on frontend
 */
export const hasApprovedRequestWithDeletedThesis = async (studentId) => {
  const request = await thesisChangeRequestRepository.findApprovedWithDeletedThesis(studentId);
  return !!request;
};

/**
 * Get change requests by student ID
 */
export const getRequestsByStudentId = async (studentId) => {
  return await thesisChangeRequestRepository.findByStudentId(studentId);
};
