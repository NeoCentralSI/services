import * as thesisSupervisorsService from '../services/thesisSupervisors.service.js';

export async function assignSupervisor2(req, res, next) {
  try {
    const { thesisId, lecturerId } = req.body;
    const actorUserId = req.user?.id || null;
    const result = await thesisSupervisorsService.assignSupervisor2(thesisId, lecturerId, actorUserId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
