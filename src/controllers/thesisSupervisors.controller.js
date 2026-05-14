import * as thesisSupervisorsService from '../services/thesisSupervisors.service.js';

export async function assignCoAdvisor(req, res, next) {
  try {
    const { thesisId, lecturerId } = req.body;
    const result = await thesisSupervisorsService.assignCoAdvisor(thesisId, lecturerId);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
