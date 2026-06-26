import { exportMetopenScoresXlsx } from "../services/assessmentExport.service.js";

export async function downloadMetopenScores(req, res, next) {
  try {
    const attendanceImportId = typeof req.query?.attendanceImportId === "string"
      && req.query.attendanceImportId.trim().length > 0
      ? req.query.attendanceImportId.trim()
      : null;

    const { buffer, filename } = await exportMetopenScoresXlsx({
      attendanceImportId,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}
