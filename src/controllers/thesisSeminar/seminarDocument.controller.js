import {
  getSeminarDocTypes,
  getStudentSeminarDocuments,
  uploadSeminarDocument,
  viewSeminarDocument,
} from "../../services/thesisSeminar/seminarDocument.service.js";

/**
 * GET /thesisSeminar/student/documents/types
 * Get available seminar document types
 */
export async function getDocumentTypes(req, res, next) {
  try {
    const data = await getSeminarDocTypes();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesisSeminar/student/documents
 * Get all submitted seminar documents for current student
 */
export async function getDocuments(req, res, next) {
  try {
    const data = await getStudentSeminarDocuments(req.user.sub);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /thesisSeminar/student/documents/upload
 * Upload or re-upload a seminar document
 * Body (multipart): file, documentTypeName
 */
export async function uploadDocument(req, res, next) {
  try {
    const { documentTypeName } = req.body;
    if (!documentTypeName) {
      return res.status(400).json({
        success: false,
        message: "documentTypeName is required",
      });
    }
    const data = await uploadSeminarDocument(
      req.user.sub,
      documentTypeName,
      req.file
    );
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /thesisSeminar/student/documents/:documentTypeId
 * View a specific seminar document
 */
export async function viewDocument(req, res, next) {
  try {
    const { documentTypeId } = req.params;
    const data = await viewSeminarDocument(req.user.sub, documentTypeId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
