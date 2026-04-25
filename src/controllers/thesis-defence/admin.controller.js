import {
  getAdminDefenceList,
  getAdminDefenceDetail,
  validateDefenceDocument,
  getDefenceSchedulingData,
  scheduleDefence,
} from "../../services/thesis-defence/admin.service.js";

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

export async function getSchedulingDataController(req, res, next) {
  try {
    const { defenceId } = req.params;
    const data = await getDefenceSchedulingData(defenceId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function setSchedule(req, res, next) {
  try {
    const { defenceId } = req.params;
    const { roomId, date, startTime, endTime, isOnline, meetingLink } = req.validated;

    const data = await scheduleDefence(defenceId, {
      roomId,
      date,
      startTime,
      endTime,
      isOnline,
      meetingLink,
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
