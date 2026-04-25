import {
  getAdminSeminarList,
  getAdminSeminarDetail,
  validateSeminarDocument,
  getSchedulingData,
  scheduleSeminar,
  getSeminarResults,
  getSeminarResultDetail,
  createSeminarResult,
  updateSeminarResult,
  deleteSeminarResult,
  getSeminarResultThesisOptions,
  getSeminarResultLecturerOptions,
  getSeminarResultStudentOptions,
  exportSeminarArchive,
  exportSeminarArchiveTemplate,
  importSeminarArchive,
  getSeminarAudienceList,
  getStudentOptionsForSeminarAudience,
  addSeminarAudience,
  removeSeminarAudience,
  importSeminarAudiences,
  exportSeminarAudiences,
  exportSeminarAudienceTemplate,
} from "../../services/thesis-seminar/admin.service.js";

/**
 * GET /thesis-seminar/admin
 * List all seminars for admin management
 */
export async function listSeminars(req, res, next) {
  try {
    const { search, status } = req.query;
    const data = await getAdminSeminarList({ search, status });
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesis-seminar/admin/:seminarId
 * Get seminar detail for admin
 */
export async function getSeminarDetail(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getAdminSeminarDetail(seminarId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesis-seminar/admin/:seminarId/documents/:documentTypeId/validate
 * Validate (approve/decline) a seminar document
 */
export async function validateDocument(req, res, next) {
  try {
    const { seminarId, documentTypeId } = req.params;
    const { action, notes } = req.body;
    const userId = req.user.id;

    const data = await validateSeminarDocument(seminarId, documentTypeId, {
      action,
      notes,
      userId,
    });

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /thesis-seminar/admin/:seminarId/scheduling-data
 * Get lecturer availabilities and rooms for scheduling UI
 */
export async function getSchedulingDataController(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getSchedulingData(seminarId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /thesis-seminar/admin/:seminarId/schedule
 * Set or update the seminar schedule
 */
export async function setSchedule(req, res, next) {
  try {
    const { seminarId } = req.params;
    const { roomId, date, startTime, endTime, isOnline, meetingLink } = req.validated;

    const data = await scheduleSeminar(seminarId, {
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

export async function getSeminarResultThesisOptionsController(req, res, next) {
  try {
    const data = await getSeminarResultThesisOptions();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultLecturerOptionsController(req, res, next) {
  try {
    const data = await getSeminarResultLecturerOptions();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultStudentOptionsController(req, res, next) {
  try {
    const data = await getSeminarResultStudentOptions();
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultsController(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;
    const search = req.query.search || "";
    const result = await getSeminarResults({ page, pageSize, search });
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function createSeminarResultController(req, res, next) {
  try {
    const body = req.validated ?? req.body ?? {};
    const userId = req.user?.sub || req.user?.id;
    const result = await createSeminarResult({
      ...body,
      assignedByUserId: userId,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function updateSeminarResultController(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.validated ?? req.body ?? {};
    const userId = req.user?.sub || req.user?.id;
    const result = await updateSeminarResult(id, {
      ...body,
      assignedByUserId: userId,
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function deleteSeminarResultController(req, res, next) {
  try {
    const { id } = req.params;
    await deleteSeminarResult(id);
    res.status(200).json({ success: true, message: "Data seminar hasil berhasil dihapus" });
  } catch (err) {
    next(err);
  }
}

export async function getSeminarResultDetailController(req, res, next) {
  try {
    const { id } = req.params;
    const data = await getSeminarResultDetail(id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}


export async function exportSeminarArchiveTemplateController(req, res, next) {
  try {
    const buffer = await exportSeminarArchiveTemplate();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Template_Arsip_Seminar.xlsx");
    res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportSeminarArchiveController(req, res, next) {
  try {
    const buffer = await exportSeminarArchive();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Arsip_Seminar.xlsx");
    res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function importSeminarArchiveController(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      const err = new Error("File Excel (.xlsx) diperlukan.");
      err.statusCode = 400;
      throw err;
    }
    const results = await importSeminarArchive(file.buffer, req.user.sub);
    res.status(200).json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
}

// ==================== Audience Controllers ====================

export async function getSeminarAudienceListController(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getSeminarAudienceList(seminarId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getStudentOptionsForSeminarAudienceController(req, res, next) {
  try {
    const { seminarId } = req.params;
    const data = await getStudentOptionsForSeminarAudience(seminarId);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function addSeminarAudienceController(req, res, next) {
  try {
    const { seminarId } = req.params;
    const { studentId } = req.validated ?? req.body ?? {};
    const result = await addSeminarAudience(seminarId, studentId);
    res.status(201).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function removeSeminarAudienceController(req, res, next) {
  try {
    const { seminarId, studentId } = req.params;
    const result = await removeSeminarAudience(seminarId, studentId);
    res.status(200).json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function importSeminarAudiencesController(req, res, next) {
  try {
    const { seminarId } = req.params;
    const file = req.file;
    if (!file) {
      const err = new Error("File Excel (.xlsx) diperlukan.");
      err.statusCode = 400;
      throw err;
    }
    const results = await importSeminarAudiences(seminarId, file);
    res.status(200).json({ success: true, ...results });
  } catch (err) {
    next(err);
  }
}

export async function exportSeminarAudienceTemplateController(req, res, next) {
  try {
    const buffer = await exportSeminarAudienceTemplate();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Template_Audience_Seminar.xlsx");
    res.status(200).send(buffer);
  } catch (err) {
    next(err);
  }
}

export async function exportSeminarAudiencesController(req, res, next) {
  try {
    const { seminarId } = req.params;
    const format = req.query.format || "excel";
    const result = await exportSeminarAudiences(seminarId, format);

    if (format === "pdf") {
      // Build simple PDF-like HTML for presentation
      const { data, seminar } = result;
      const rows = data.map((r, i) =>
        `<tr><td>${r.No}</td><td>${r["Nama Mahasiswa"]}</td><td>${r["NIM"]}</td><td>${r["Disetujui Pada"]}</td><td>${r["Disetujui Oleh"]}</td></tr>`
      ).join("");
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Daftar Audience Seminar</title>
<style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}p{margin:2px 0;color:#555}
table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #ccc;padding:8px 10px;text-align:left}th{background:#f0f0f0}</style>
</head><body>
<h2>Daftar Audience Seminar Hasil</h2>
<p>Tanggal Seminar: ${seminar.date ? new Date(seminar.date).toLocaleDateString("id-ID") : "-"}</p>
<table><thead><tr><th>No</th><th>Nama Mahasiswa</th><th>NIM</th><th>Disetujui Pada</th><th>Disetujui Oleh</th></tr></thead>
<tbody>${rows}</tbody></table>
</body></html>`;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=Audience_Seminar_${seminarId}.html`);
      return res.status(200).send(html);
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Audience_Seminar.xlsx`);
    res.status(200).send(result);
  } catch (err) {
    next(err);
  }
}
