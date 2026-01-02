import { getSupervisorAvailabilityPublic } from "../../services/thesisGuidance/student.guidance.service.js";

export async function publicSupervisorAvailability(req, res, next) {
  try {
    const { supervisorId } = req.params;
    const { start, end } = req.query || {};
    const result = await getSupervisorAvailabilityPublic(supervisorId, start, end);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}
