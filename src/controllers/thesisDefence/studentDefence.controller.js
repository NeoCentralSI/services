import {
  getStudentDefenceOverview,
  getDefenceDocumentTypesService,
  getStudentDefenceDocuments,
  uploadDefenceDocumentService,
} from "../../services/thesisDefence/studentDefence.service.js";

export async function getDefenceOverviewCtrl(req, res, next) {
  try {
    const data = await getStudentDefenceOverview(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getDefenceDocumentTypesCtrl(req, res, next) {
  try {
    const data = await getDefenceDocumentTypesService();
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getDefenceDocumentsCtrl(req, res, next) {
  try {
    const data = await getStudentDefenceDocuments(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function uploadDefenceDocumentCtrl(req, res, next) {
  try {
    const { documentTypeName } = req.body;
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: "File diperlukan." });
    }
    const data = await uploadDefenceDocumentService(
      req.user.sub,
      file,
      documentTypeName
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
