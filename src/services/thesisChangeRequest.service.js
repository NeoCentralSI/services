import * as thesisChangeRequestRepository from '../repositories/thesisChangeRequest.repository.js';
import prisma from '../config/prisma.js';
import fs from "fs/promises";
import path from "path";
import PizZip from "pizzip";

import { createNotificationsForUsers } from './notification.service.js';
import { sendFcmToUsers } from './push.service.js';
import { ROLES, SUPERVISOR_ROLES } from '../constants/roles.js';
import { convertDocxToPdf } from '../utils/pdf.util.js';

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
  const { requestType, reason, newTitle, newTopicId } = data;

  if (requestType !== 'topic') {
    throw new BadRequestError('Hanya pergantian topik yang diperbolehkan');
  }

  if (!newTitle || !newTopicId) {
    throw new BadRequestError('Judul baru dan topik baru harus diisi');
  }

  // Validate the new topic exists
  const newTopic = await prisma.thesisTopic.findUnique({ where: { id: newTopicId } });
  if (!newTopic) {
    throw new NotFoundError('Topik baru tidak ditemukan');
  }

  // Get student's active thesis
  const thesis = await prisma.thesis.findFirst({
    where: {
      student: { id: userId },
      thesisStatus: { name: { notIn: ['Dibatalkan', 'Gagal', 'Selesai', 'Lulus', 'Drop Out'] } },
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

  // Get "Diajukan" status for the new thesis
  let diajukanStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Diajukan' } });
  if (!diajukanStatus) {
    diajukanStatus = await prisma.thesisStatus.create({ data: { name: 'Diajukan', description: 'Diajukan oleh mahasiswa' } });
  }

  // Get active academic year
  const academicYear = await prisma.academicYear.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
  });

  // Create new thesis record with "Diajukan" status
  const newThesis = await prisma.thesis.create({
    data: {
      title: newTitle,
      studentId: thesis.studentId,
      thesisTopicId: newTopicId,
      thesisStatusId: diajukanStatus.id,
      academicYearId: academicYear?.id,
    },
  });

  // Create the change request linking to the OLD thesis
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
    const notifTitle = 'Permintaan Pergantian Topik';
    const notifMessage = `${thesis.student.user.fullName} mengajukan permintaan pergantian topik ke "${newTitle}". Mohon tinjau permintaan ini.`;

    await createNotificationsForUsers(
      supervisorUserIds,
      {
        title: notifTitle,
        message: notifMessage,
        type: 'THESIS_CHANGE_REQUEST',
        referenceId: request.id,
        link: `/tugas-akhir/change-requests/${request.id}`
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

  return flattenRequest(request);
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

  // Wrap all data mutations in a transaction for consistency
  const updatedRequest = await prisma.$transaction(async (tx) => {
    // Update request status
    const updated = await tx.thesisChangeRequest.update({
      where: { id: requestId },
      data: {
        status: 'approved',
        reviewedBy: reviewerId,
        reviewNotes,
        reviewedAt: new Date(),
      },
      include: {
        thesis: {
          include: {
            student: { include: { user: true } },
            thesisSupervisors: { include: { lecturer: { include: { user: { select: { id: true, fullName: true } } } } } },
          },
        },
      },
    });

    // 1. Archive the OLD thesis
    const dibatalkanStatus = await tx.thesisStatus.findFirst({
      where: { name: 'Dibatalkan' }
    });

    if (dibatalkanStatus) {
      await tx.thesis.update({
        where: { id: request.thesisId },
        data: {
          thesisStatusId: dibatalkanStatus.id,
          rating: 'CANCELLED',
        }
      });
    }

    // 2. Find the student's new thesis (created during submitRequest with "Diajukan" status)
    const studentId = request.thesis?.studentId;
    if (studentId) {
      const diajukanStatus = await tx.thesisStatus.findFirst({ where: { name: 'Diajukan' } });
      const newThesis = await tx.thesis.findFirst({
        where: {
          studentId,
          thesisStatusId: diajukanStatus?.id,
          id: { not: request.thesisId },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (newThesis) {
        // 3. Activate the new thesis with "Bimbingan" status
        let bimbinganStatus = await tx.thesisStatus.findFirst({ where: { name: 'Bimbingan' } });
        if (!bimbinganStatus) {
          bimbinganStatus = await tx.thesisStatus.create({ data: { name: 'Bimbingan', description: 'Dalam bimbingan' } });
        }

        await tx.thesis.update({
          where: { id: newThesis.id },
          data: {
            thesisStatusId: bimbinganStatus.id,
            rating: 'ONGOING',
            startDate: new Date(),
            deadlineDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
          },
        });

        // 4. Move supervisors from old thesis to new thesis
        await tx.thesisSupervisors.updateMany({
          where: { thesisId: request.thesisId },
          data: { thesisId: newThesis.id },
        });

        // 5. Auto-create milestones from topic templates
        if (newThesis.thesisTopicId) {
          const templates = await tx.thesisMilestoneTemplate.findMany({
            where: { topicId: newThesis.thesisTopicId, isActive: true },
            orderBy: { orderIndex: 'asc' },
          });

          if (templates.length > 0) {
            await tx.thesisMilestone.createMany({
              data: templates.map(m => ({
                thesisId: newThesis.id,
                title: m.name,
                description: m.description,
                orderIndex: m.orderIndex,
                status: 'not_started',
              })),
            });
          }
        }
      }
    }

    return updated;
  });

  // Notify student (outside transaction — non-critical)
  await notifyStudentApproval(updatedRequest);

  // Notify supervisors about the topic change approval
  try {
    const supervisors = request.thesis?.thesisSupervisors || updatedRequest.thesis?.thesisSupervisors || [];
    const supervisorUserIds = supervisors.map((s) => s.lecturer?.user?.id).filter(Boolean);
    const studentName = request.thesis?.student?.user?.fullName || 'Mahasiswa';

    if (supervisorUserIds.length > 0) {
      await createNotificationsForUsers(supervisorUserIds, {
        title: 'Pergantian Topik TA Disetujui',
        message: `Permintaan pergantian topik dari ${studentName} telah disetujui oleh Ketua Departemen. Supervisi Anda telah dipindahkan ke tugas akhir baru.`,
      });

      await sendFcmToUsers(supervisorUserIds, {
        title: 'Pergantian Topik TA Disetujui',
        body: `Permintaan pergantian topik dari ${studentName} telah disetujui. Supervisi Anda dipindahkan ke TA baru.`,
        data: { type: 'THESIS_CHANGE_REQUEST_APPROVED_SUPERVISOR', requestId },
      });
    }
  } catch (e) {
    console.error('Failed to notify supervisors about topic change approval:', e);
  }

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

  // Clean up the new proposed thesis (delete the "Diajukan" thesis)
  await cleanupProposedThesis(request);

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

    const notifTitle = 'Permintaan Pergantian Topik Disetujui';
    const notifMessage = `Permintaan pergantian topik Anda telah disetujui. Tugas akhir baru Anda telah aktif dengan status Bimbingan.`;

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
 * Clean up the proposed thesis when a change request is rejected.
 * Deletes the "Diajukan" thesis that was created during submitRequest.
 */
const cleanupProposedThesis = async (request) => {
  try {
    const studentId = request.thesis?.studentId;
    if (!studentId) return;

    const diajukanStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Diajukan' } });
    if (!diajukanStatus) return;

    const proposedThesis = await prisma.thesis.findFirst({
      where: {
        studentId,
        thesisStatusId: diajukanStatus.id,
        id: { not: request.thesisId },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (proposedThesis) {
      // Delete any milestones that may have been created
      await prisma.thesisMilestone.deleteMany({ where: { thesisId: proposedThesis.id } });
      // Delete the proposed thesis
      await prisma.thesis.delete({ where: { id: proposedThesis.id } });
    }
  } catch (error) {
    console.error('Failed to cleanup proposed thesis:', error);
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

    // Clean up the new proposed thesis
    await cleanupProposedThesis(request);

    const studentUserId = request.thesis.student.user.id;
    const notifTitle = 'Permintaan Pergantian Topik Ditolak';
    const notifMessage = `Permintaan pergantian topik Anda ditolak oleh dosen pembimbing. Alasan: ${notes}`;

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
 * Get all pending change requests for a lecturer
 */
export const getPendingRequestsForLecturerList = async (lecturerId) => {
  const requests = await thesisChangeRequestRepository.findAllPendingForLecturer(lecturerId);

  // Enrich each request with proposed thesis info
  const enrichedRequests = await Promise.all(requests.map(async (request) => {
    const studentId = request.thesis?.student?.id;
    if (studentId) {
      const diajukanStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Diajukan' } });
      if (diajukanStatus) {
        const proposedThesis = await prisma.thesis.findFirst({
          where: {
            studentId,
            thesisStatusId: diajukanStatus.id,
            id: { not: request.thesisId },
          },
          orderBy: { createdAt: 'desc' },
          include: {
            thesisTopic: { select: { id: true, name: true } },
          },
        });
        if (proposedThesis) {
          request.proposedThesis = {
            id: proposedThesis.id,
            title: proposedThesis.title,
            topic: proposedThesis.thesisTopic,
          };
        }
      }
    }
    return flattenRequest(request);
  }));

  return enrichedRequests;
};

/**
 * Get pending change request for a specific thesis that requires lecturer review.
 * Also includes the proposed new thesis info (created during submitRequest).
 */
export const getPendingRequestForLecturer = async (thesisId, lecturerId) => {
  const request = await thesisChangeRequestRepository.findPendingForLecturerByThesisId(thesisId, lecturerId);
  if (!request) return null;

  // Find the student's new proposed thesis (created during submit)
  const studentId = request.thesis?.student?.id;
  if (studentId) {
    const diajukanStatus = await prisma.thesisStatus.findFirst({ where: { name: 'Diajukan' } });
    if (diajukanStatus) {
      const proposedThesis = await prisma.thesis.findFirst({
        where: {
          studentId,
          thesisStatusId: diajukanStatus.id,
          id: { not: request.thesisId },
        },
        orderBy: { createdAt: 'desc' },
        include: {
          thesisTopic: { select: { id: true, name: true } },
        },
      });
      if (proposedThesis) {
        request.proposedThesis = {
          id: proposedThesis.id,
          title: proposedThesis.title,
          topic: proposedThesis.thesisTopic,
        };
      }
    }
  }

  return request;
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

// =========================================================================
// PDF REPORT GENERATION FOR KADEP
// =========================================================================

function escapeXml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeCell(text, opts = {}) {
  const { bold = false, center = false, fontSize = 18, shading = "" } = opts;
  const jc = center ? '<w:jc w:val="center"/>' : "";
  const b = bold ? "<w:b/><w:bCs/>" : "";
  const shd = shading ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>` : "";
  const rpr = `<w:rPr>${b}<w:sz w:val="${fontSize}"/><w:szCs w:val="${fontSize}"/></w:rPr>`;
  const ppr = `<w:pPr>${jc}<w:spacing w:after="0" w:line="240" w:lineRule="auto"/>${rpr}</w:pPr>`;

  const lines = (text || "").split("\n");
  const paragraphs = lines
    .map(
      (line) =>
        `<w:p>${ppr}<w:r>${rpr}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`
    )
    .join("");

  return `<w:tc><w:tcPr>${shd}<w:vAlign w:val="center"/></w:tcPr>${paragraphs}</w:tc>`;
}

function buildChangeRequestReportXml(generatedAt, requests) {
  const formatDateLong = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("id-ID", {
      day: "numeric", month: "long", year: "numeric",
    });
  };

  const titleXml = `
    <w:p>
      <w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>
      <w:r>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>
        <w:t>Laporan Riwayat Pergantian Topik &amp; Pembimbing Tugas Akhir</w:t>
      </w:r>
    </w:p>`;

  const headerRow = `
    <w:tr>
      ${makeCell("No", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("NIM", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Nama Mahasiswa", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Dosen Pembimbing", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Alasan", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Judul Baru", { bold: true, center: true, fontSize: 20 })}
      ${makeCell("Tanggal", { bold: true, center: true, fontSize: 20 })}
    </w:tr>`;

  const dataRows = requests.map((req, i) => {
    const studentInfo = req.student?.user || req.thesis?.student?.user || {};
    const nim = studentInfo.identityNumber || "-";
    const name = studentInfo.fullName || "-";
    
    // Use supervisors from the new thesis if it's an approved request (since they were moved)
    // or from the old thesis otherwise.
    const actualThesis = req.newThesisData || req.thesis;
    const supervisors = actualThesis?.thesisSupervisors
      ?.filter(s => SUPERVISOR_ROLES.includes(s.role?.name))
      ?.map(s => s.lecturer?.user?.fullName)
      ?.filter(Boolean) || [];
    const supervisorsStr = supervisors.join("\n");

    const newTopicTitle = req.newThesisTitle || "-";
    const dateStr = formatDateLong(req.createdAt);

    return `
      <w:tr>
        ${makeCell(String(i + 1), { center: true, fontSize: 20 })}
        ${makeCell(nim, { center: true, fontSize: 20 })}
        ${makeCell(name, { center: false, fontSize: 20 })}
        ${makeCell(supervisorsStr, { center: false, fontSize: 20 })}
        ${makeCell(req.reason || "-", { center: false, fontSize: 20 })}
        ${makeCell(newTopicTitle, { center: false, fontSize: 20 })}
        ${makeCell(dateStr, { center: true, fontSize: 20 })}
      </w:tr>`;
  }).join("");

  const tableXml = `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="5000" w:type="pct"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
        </w:tblBorders>
        <w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>
      </w:tblPr>
      <w:tblGrid>
        <w:gridCol w:w="850"/>
        <w:gridCol w:w="2500"/>
        <w:gridCol w:w="3000"/>
        <w:gridCol w:w="2800"/>
        <w:gridCol w:w="2800"/>
        <w:gridCol w:w="3100"/>
        <w:gridCol w:w="1240"/>
      </w:tblGrid>
      ${headerRow}
      ${dataRows}
    </w:tbl>`;

  const signatureXml = `
    <w:p><w:pPr><w:spacing w:before="480"/></w:pPr></w:p>
    <w:p>
      <w:pPr>
        <w:jc w:val="right"/>
        <w:keepLines/>
        <w:spacing w:after="0"/>
      </w:pPr>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>Padang, ${formatDateLong(generatedAt)}</w:t>
        <w:br/>
        <w:t>Mengetahui,</w:t>
        <w:br/>
        <w:t>Ketua Departemen,</w:t>
        <w:br/>
        <w:br/>
        <w:br/>
        <w:br/>
      </w:r>
      <w:r>
        <w:rPr><w:b/><w:bCs/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>Ricky Akbar M.Kom</w:t>
        <w:br/>
      </w:r>
      <w:r>
        <w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
        <w:t>NIP. 198410062012121001</w:t>
      </w:r>
    </w:p>`;

  return titleXml + tableXml + signatureXml;
}

function extractHeaderFromDocXml(body) {
  const stopPatterns = [/TA\s*[–\-]/, /Identitas/i, /\{[a-z#]/];
  let firstStopPos = body.length;
  for (const pattern of stopPatterns) {
    const m = body.match(pattern);
    if (m && m.index < firstStopPos) firstStopPos = m.index;
  }
  if (firstStopPos >= body.length || firstStopPos <= 0) {
    const firstTable = body.indexOf("<w:tbl");
    if (firstTable > 0) return body.substring(0, firstTable);
    return "";
  }
  const events = [];
  const scanRegex = /(<w:tbl[\s>])|(<\/w:tbl>)|(<\/w:p>)|(<\/w:sdt>)/g;
  let m;
  while ((m = scanRegex.exec(body)) !== null) {
    if (m[1]) events.push({ pos: m.index, end: m.index, type: "open-tbl" });
    else if (m[2]) events.push({ pos: m.index, end: m.index + m[2].length, type: "close-tbl" });
    else if (m[3]) events.push({ pos: m.index, end: m.index + m[3].length, type: "close-p" });
    else if (m[4]) events.push({ pos: m.index, end: m.index + m[4].length, type: "close-sdt" });
  }
  let tblDepth = 0;
  const cutPoints = [0];
  for (const ev of events) {
    if (ev.type === "open-tbl") tblDepth++;
    else if (ev.type === "close-tbl") {
      tblDepth--;
      if (tblDepth === 0) cutPoints.push(ev.end);
    } else if (ev.type === "close-p" || ev.type === "close-sdt") {
      if (tblDepth === 0) cutPoints.push(ev.end);
    }
  }
  let bestCut = 0;
  for (const cp of cutPoints) {
    if (cp <= firstStopPos) bestCut = cp;
  }
  return body.substring(0, bestCut);
}

export async function generateChangeRequestReportPdfService(statusFilter, search) {
  // Use 'approved' status as forced by USER requirement
  const forcedStatus = "approved";

  // Fetch data
  const result = await getAllRequests({ page: 1, pageSize: 10000, status: forcedStatus, search });
  const requests = result.data || [];

  // Enhance data with New Topic titles and their supervisors
  for (const req of requests) {
    const studentId = req.thesis?.studentId;
    if (studentId) {
      // For approved requests, search for the 'other' thesis that exists for this student.
      // The new thesis is created during submitRequest, often just milliseconds before the ChangeRequest.
      // After approval, its status is likely 'Bimbingan' or similar.
      const newThesis = await prisma.thesis.findFirst({
        where: {
          studentId,
          id: { not: req.thesisId },
          // Any thesis created at or slightly after the old one was being changed
          createdAt: { gte: req.thesis?.createdAt }
        },
        orderBy: { createdAt: 'desc' },
        include: {
          thesisSupervisors: {
            include: {
              lecturer: { include: { user: { select: { id: true, fullName: true } } } },
              role: true
            }
          }
        }
      });

      if (newThesis) {
        req.newThesisTitle = newThesis.title;
        req.newThesisData = newThesis;
      }
    }
  }

  const templatePath = path.join(process.cwd(), "uploads", "sop", "logcatatantemplate.docx");
  
  let headerXml = "";
  let sectPr = `<w:sectPr><w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/></w:sectPr>`;
  let docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body></w:body></w:document>`;
  let zip = null;
  let hasValidTemplate = false;

  try {
    const content = await fs.readFile(templatePath);
    zip = new PizZip(content);
    const docXmlFile = zip.file("word/document.xml");
    if (docXmlFile) {
      docXml = docXmlFile.asText();
      const bodyStartTag = "<w:body>";
      const bodyStart = docXml.indexOf(bodyStartTag) + bodyStartTag.length;
      const bodyEnd = docXml.lastIndexOf("</w:body>");
      const body = docXml.substring(bodyStart, bodyEnd);
  
      const sectPrMatch = body.match(/<w:sectPr[\s\S]*?<\/w:sectPr>/);
      if (sectPrMatch) {
        sectPr = sectPrMatch[0].replace(/<w:pgSz[^>]*\/>/, '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
      }
      
      headerXml = extractHeaderFromDocXml(body);
      hasValidTemplate = true;
    }
  } catch (e) {
    // If no template, we just proceed with bare XML (it will lack Kop Surat but still generate a PDF)
    console.error("Warning: Change Request Report could not read logcatatantemplate.docx. Will generate without Kop.");
    zip = new PizZip();
    // Basic valid OOXML wrapper for Gotenberg will fail if we don't have a whole docx skeleton.
    // For safety, we throw if we truly need the kop
    throw new Error("Template log catatan (TA-06) belum diupload. Template dibutuhkan untuk header laporan.");
  }

  const generatedAt = new Date().toISOString();
  const reportContentXml = buildChangeRequestReportXml(generatedAt, requests);

  const bodyStartTag = "<w:body>";
  const bodyStart = docXml.indexOf(bodyStartTag) + bodyStartTag.length;
  const bodyEnd = docXml.lastIndexOf("</w:body>");

  const newBody = headerXml + reportContentXml + sectPr;
  const newDocXml = docXml.substring(0, bodyStart) + newBody + docXml.substring(bodyEnd);
  
  zip.file("word/document.xml", newDocXml);

  const docxBuffer = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  
  const docxFilename = `Laporan_Pergantian_TA_${new Date().toISOString().slice(0, 10)}.docx`;
  const pdfBuffer = await convertDocxToPdf(docxBuffer, docxFilename);

  return {
    buffer: pdfBuffer,
    filename: `Laporan_Pergantian_TA_${new Date().toISOString().slice(0, 10)}.pdf`,
  };
}
