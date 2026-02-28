import * as thesisChangeRequestService from '../services/thesisChangeRequest.service.js';
import prisma from '../config/prisma.js';

/**
 * Submit a new thesis change request (student)
 */
export const submitRequest = async (req, res, next) => {
  try {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      const error = new Error('User ID not found in token');
      error.statusCode = 401;
      throw error;
    }
    const data = req.body;

    const result = await thesisChangeRequestService.submitRequest(userId, data);

    res.status(201).json({
      success: true,
      message: 'Permintaan pergantian berhasil diajukan',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get student's own change requests
 */
export const getMyRequests = async (req, res, next) => {
  try {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      const error = new Error('User ID not found in token');
      error.statusCode = 401;
      throw error;
    }
    const result = await thesisChangeRequestService.getMyRequests(userId);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get pending requests (Kadep)
 */
export const getPendingRequests = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, search = '' } = req.query;
    const result = await thesisChangeRequestService.getPendingRequests({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      search,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all requests with filters (Kadep)
 */
export const getAllRequests = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, search = '', status = '' } = req.query;
    const result = await thesisChangeRequestService.getAllRequests({
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      search,
      status,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get request detail by ID
 */
export const getRequestById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await thesisChangeRequestService.getRequestById(id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve change request (Kadep)
 */
export const approveRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reviewerId = req.user.sub || req.user.id;
    if (!reviewerId) {
      const error = new Error('User ID not found in token');
      error.statusCode = 401;
      throw error;
    }
    const { reviewNotes } = req.body;

    const result = await thesisChangeRequestService.approveRequest(id, reviewerId, reviewNotes);

    res.status(200).json({
      success: true,
      message: 'Permintaan pergantian berhasil disetujui. Data TA mahasiswa telah dihapus.',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reject change request (Kadep)
 */
export const rejectRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const reviewerId = req.user.sub || req.user.id;
    if (!reviewerId) {
      const error = new Error('User ID not found in token');
      error.statusCode = 401;
      throw error;
    }
    const { reviewNotes } = req.body;

    const result = await thesisChangeRequestService.rejectRequest(id, reviewerId, reviewNotes);

    res.status(200).json({
      success: true,
      message: 'Permintaan pergantian berhasil ditolak',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get pending request count (Kadep dashboard)
 */
export const getPendingCount = async (req, res, next) => {
  try {
    const count = await thesisChangeRequestService.getPendingCount();

    res.status(200).json({
      success: true,
      data: { count },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Review change request (Lecturer)
 */
export const reviewRequestByLecturer = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      const error = new Error('User ID not found in token');
      error.statusCode = 401;
      throw error;
    }

    // Get lecturer ID from user ID
    const lecturer = await prisma.lecturer.findFirst({
      where: { user: { id: userId } }
    });
    if (!lecturer) {
      const error = new Error('Anda tidak terdaftar sebagai dosen');
      error.statusCode = 403;
      throw error;
    }

    const { status, notes } = req.body;

    const result = await thesisChangeRequestService.reviewRequestByLecturer(id, lecturer.id, status, notes);

    res.status(200).json({
      success: true,
      message: 'Review berhasil disimpan',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get pending change request for a thesis (Lecturer)
 */
export const getPendingRequestForThesis = async (req, res, next) => {
  try {
    const { thesisId } = req.params;
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      const error = new Error('User ID not found in token');
      error.statusCode = 401;
      throw error;
    }

    // Get lecturer ID from user ID
    const lecturer = await prisma.lecturer.findFirst({
      where: { user: { id: userId } }
    });
    if (!lecturer) {
      const error = new Error('Anda tidak terdaftar sebagai dosen');
      error.statusCode = 403;
      throw error;
    }

    const result = await thesisChangeRequestService.getPendingRequestForLecturer(thesisId, lecturer.id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all pending change requests for a lecturer
 */
export const getPendingRequestsForLecturer = async (req, res, next) => {
  try {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      const error = new Error('User ID not found in token');
      error.statusCode = 401;
      throw error;
    }

    // Get lecturer ID from user ID
    const lecturer = await prisma.lecturer.findFirst({
      where: { user: { id: userId } }
    });
    if (!lecturer) {
      const error = new Error('Anda tidak terdaftar sebagai dosen');
      error.statusCode = 403;
      throw error;
    }

    const result = await thesisChangeRequestService.getPendingRequestsForLecturerList(lecturer.id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Check if student has an approved change request where thesis was deleted
 * Used to show "please re-register" message on frontend
 */
export const checkApprovedWithDeletedThesis = async (req, res, next) => {
  try {
    const userId = req.user.sub || req.user.id;
    if (!userId) {
      const error = new Error('User ID not found in token');
      error.statusCode = 401;
      throw error;
    }

    const hasApproved = await thesisChangeRequestService.hasApprovedRequestWithDeletedThesis(userId);

    res.status(200).json({
      success: true,
      data: { hasApprovedRequest: hasApproved },
    });
  } catch (error) {
    next(error);
  }
};