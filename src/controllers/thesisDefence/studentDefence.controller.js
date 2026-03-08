import {
  getStudentDefenceOverview,
  getDefenceDocumentTypesService,
  getStudentDefenceDocuments,
  uploadDefenceDocumentService,
  getStudentDefenceHistoryService,
  getStudentDefenceDetailService,
  getStudentDefenceAssessmentService,
  getStudentDefenceRevisionService,
  createStudentDefenceRevisionService,
  saveStudentDefenceRevisionActionService,
  submitStudentDefenceRevisionActionService,
  cancelStudentDefenceRevisionActionService,
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

export async function getStudentDefenceHistoryCtrl(req, res, next) {
  try {
    const data = await getStudentDefenceHistoryService(req.user.sub);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getStudentDefenceDetailCtrl(req, res, next) {
  try {
    const { defenceId } = req.params;
    const data = await getStudentDefenceDetailService(req.user.sub, defenceId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getStudentDefenceAssessmentCtrl(req, res, next) {
  try {
    const { defenceId } = req.params;
    const data = await getStudentDefenceAssessmentService(req.user.sub, defenceId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getStudentDefenceRevisionCtrl(req, res, next) {
  try {
    const { defenceId } = req.params;
    const data = await getStudentDefenceRevisionService(req.user.sub, defenceId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createStudentDefenceRevisionCtrl(req, res, next) {
  try {
    const { defenceId } = req.params;
    const data = await createStudentDefenceRevisionService(
      req.user.sub,
      defenceId,
      req.body
    );
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function saveStudentDefenceRevisionActionCtrl(req, res, next) {
  try {
    const { revisionId } = req.params;
    const { revisionAction } = req.body;
    const data = await saveStudentDefenceRevisionActionService(
      req.user.sub,
      revisionId,
      revisionAction
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function submitStudentDefenceRevisionActionCtrl(req, res, next) {
  try {
    const { revisionId } = req.params;
    const { revisionAction } = req.body;
    const data = await submitStudentDefenceRevisionActionService(
      req.user.sub,
      revisionId,
      revisionAction
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function cancelStudentDefenceRevisionActionCtrl(req, res, next) {
  try {
    const { revisionId } = req.params;
    const data = await cancelStudentDefenceRevisionActionService(
      req.user.sub,
      revisionId
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
