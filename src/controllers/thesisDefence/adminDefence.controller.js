import {
  getAdminDefenceList,
  getAdminDefenceDetail,
  validateDefenceDocument,
} from "../../services/thesisDefence/adminDefence.service.js";

export async function listDefences(req, res, next) {
  try {
    const { search, status } = req.query;
    const data = await getAdminDefenceList({ search, status });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getDefenceDetail(req, res, next) {
  try {
    const { defenceId } = req.params;
    const data = await getAdminDefenceDetail(defenceId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function validateDocument(req, res, next) {
  try {
    const { defenceId, documentTypeId } = req.params;
    const { action, notes } = req.body;
    const userId = req.user.id;

    const data = await validateDefenceDocument(defenceId, documentTypeId, {
      action,
      notes,
      userId,
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
