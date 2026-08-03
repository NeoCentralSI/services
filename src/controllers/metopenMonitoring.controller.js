import { getMetopenMonitoring } from "../services/metopenMonitoring.service.js";

export async function getMonitoring(req, res, next) {
  try {
    const data = await getMetopenMonitoring({
      academicYearId: req.query?.academicYearId,
    });
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}
