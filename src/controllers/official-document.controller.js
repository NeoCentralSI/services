import {
  checkOfficialDocumentHash,
  getOfficialDocumentVerification,
} from "../services/official-document.service.js";

export async function verifyDocument(req, res, next) {
  try {
    const data = await getOfficialDocumentVerification(req.params.token);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function checkDocumentHash(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File PDF wajib dilampirkan untuk pemeriksaan integritas.",
      });
    }
    const data = await checkOfficialDocumentHash(req.params.token, req.file.buffer);
    res.json({ success: true, ...data });
  } catch (error) {
    next(error);
  }
}
