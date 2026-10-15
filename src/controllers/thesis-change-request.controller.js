import * as service from "../services/thesis-change-request.service.js";

const ok = (res, data, message = undefined, status = 200) =>
  res.status(status).json({ success: true, ...(message ? { message } : {}), data });

/** GET /thesis-change-requests/context[?thesisId=] — may a request be made, and the requests so far */
export async function getContext(req, res, next) {
  try {
    const thesisId = typeof req.query.thesisId === "string" && req.query.thesisId ? req.query.thesisId : null;
    ok(res, await service.getThesisChangeContext(req.user.sub, thesisId));
  } catch (err) {
    next(err);
  }
}

/** GET /thesis-change-requests/supervisor-options[?position=] */
export async function getSupervisorOptions(req, res, next) {
  try {
    ok(res, await service.getSupervisorOptions(req.query.position));
  } catch (err) {
    next(err);
  }
}

/** POST /thesis-change-requests */
export async function submitRequest(req, res, next) {
  try {
    ok(res, await service.submitRequest(req.user.sub, req.validated), "Pengajuan perubahan berhasil dikirim", 201);
  } catch (err) {
    next(err);
  }
}

/** POST /thesis-change-requests/transfer */
export async function submitTransfer(req, res, next) {
  try {
    const result = await service.submitTransfer(req.user.sub, req.validated);
    ok(res, result, `Pengalihan ${result.requests.length} mahasiswa berhasil diajukan`, 201);
  } catch (err) {
    next(err);
  }
}

/** GET /thesis-change-requests/lecturer */
export async function listForLecturer(req, res, next) {
  try {
    ok(res, await service.listForLecturer(req.user.sub));
  } catch (err) {
    next(err);
  }
}

/** POST /thesis-change-requests/:id/lecturer-decision */
export async function decideAsLecturer(req, res, next) {
  try {
    const data = await service.decideAsLecturer(req.user.sub, req.params.id, req.validated);
    ok(res, data, req.validated.approve ? "Pengajuan disetujui" : "Pengajuan ditolak");
  } catch (err) {
    next(err);
  }
}

/** POST /thesis-change-requests/:id/cancel */
export async function cancelRequest(req, res, next) {
  try {
    ok(res, await service.cancelRequest(req.user.sub, req.params.id), "Pengajuan dibatalkan");
  } catch (err) {
    next(err);
  }
}

/** GET /thesis-change-requests/department?scope=pending|history&search=&page=&pageSize= */
/** GET /thesis-change-requests/inbox (Lanjutan Paket E4) */
export async function listInbox(req, res, next) {
  try {
    const { scope, search, page, pageSize, batchId } = req.query;
    const result = await service.listInbox(req.user.sub, { scope, search, page, pageSize, batchId });
    res.json({ success: true, data: result.data, meta: result.meta, counts: result.counts });
  } catch (err) {
    next(err);
  }
}

export async function listForDepartment(req, res, next) {
  try {
    const { scope, search, page, pageSize } = req.query;
    const result = await service.listForDepartment(req.user.sub, { scope, search, page, pageSize });
    res.json({ success: true, data: result.data, meta: result.meta });
  } catch (err) {
    next(err);
  }
}

/** POST /thesis-change-requests/:id/decision */
export async function decideAsKadep(req, res, next) {
  try {
    const data = await service.decideAsKadep(req.user.sub, req.params.id, req.validated);
    ok(res, data, req.validated.approve ? "Pengajuan disetujui dan perubahan diterapkan" : "Pengajuan ditolak");
  } catch (err) {
    next(err);
  }
}

/** POST /thesis-change-requests/batch/:batchId/decision */
export async function decideBatchAsKadep(req, res, next) {
  try {
    const data = await service.decideBatchAsKadep(req.user.sub, req.params.batchId, req.validated);
    const verb = req.validated.approve ? "disetujui" : "ditolak";
    ok(res, data, data.failed > 0 ? `${data.decided} pengajuan ${verb}, ${data.failed} gagal diproses` : `${data.decided} pengajuan ${verb}`);
  } catch (err) {
    next(err);
  }
}
