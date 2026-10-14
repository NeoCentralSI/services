import * as requests from "../services/thesis-proposal/supervisor-request.service.js";

const ok = (res, data, message = undefined, status = 200) =>
  res.status(status).json({ success: true, ...(message ? { message } : {}), data });

const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (err) {
    next(err);
  }
};

// ── Student ──────────────────────────────────────────────────────────────────────────
/** GET /thesis-proposals/me/supervisor-requests — the student's requests, draft, and whether a new one may be sent */
export const getMySupervisorRequests = handle(async (req, res) => ok(res, await requests.getStudentRequests(req.user.sub)));
/** PUT /thesis-proposals/me/supervisor-request-draft */
export const saveMyDraft = handle(async (req, res) => ok(res, await requests.saveDraft(req.user.sub, req.validated), "Draf pengajuan disimpan"));
/** GET /thesis-proposals/catalog — lecturers with their supervision load */
export const getCatalog = handle(async (req, res) => ok(res, await requests.getCatalog(req.user.sub)));
/** POST /thesis-proposals/supervisor-requests */
export const submitRequest = handle(async (req, res) =>
  ok(res, await requests.submitRequest(req.user.sub, req.validated), "Pengajuan pembimbing berhasil dikirim", 201));
/** POST /thesis-proposals/supervisor-requests/:id/withdraw — pull back (waiting) or cancel (accepted) */
export const withdrawRequest = handle(async (req, res) => {
  const data = await requests.withdrawRequest(req.params.id, req.user.sub);
  ok(res, data, data.status === "cancelled" ? "Pengajuan dibatalkan" : "Pengajuan ditarik");
});

// ── Lecturer ─────────────────────────────────────────────────────────────────────────
/** GET /thesis-proposals/supervisor-requests/inbox */
export const getLecturerInbox = handle(async (req, res) => ok(res, await requests.getLecturerInbox(req.user.sub)));
/** POST /thesis-proposals/supervisor-requests/:id/review */
export const markUnderReview = handle(async (req, res) =>
  ok(res, await requests.markUnderReview(req.params.id, req.user.sub), "Pengajuan ditandai sedang ditinjau"));
/** POST /thesis-proposals/supervisor-requests/:id/respond */
export const respondAsLecturer = handle(async (req, res) => {
  const data = await requests.respondAsLecturer(req.params.id, req.user.sub, req.validated);
  const message = data.status === "pending_kadep"
    ? "Pengajuan diteruskan ke Ketua Departemen karena Anda sudah mencapai batas bimbingan"
    : data.status === "accepted" ? "Pengajuan diterima" : "Pengajuan ditolak";
  ok(res, data, message);
});

// ── Head of Department ───────────────────────────────────────────────────────────────
/** GET /thesis-proposals/supervisor-requests/kadep-queue */
export const getKadepQueue = handle(async (req, res) => ok(res, await requests.getKadepQueue()));
/** GET /thesis-proposals/supervisor-requests/:id/recommendations */
export const getRecommendations = handle(async (req, res) => ok(res, await requests.getRecommendations(req.params.id)));
/** GET /thesis-proposals/supervisor-requests/:id/assignable-lecturers */
export const getAssignableLecturers = handle(async (req, res) => ok(res, await requests.getAssignableLecturers(req.params.id)));
/** POST /thesis-proposals/supervisor-requests/:id/decision */
export const decideAsKadep = handle(async (req, res) => {
  const data = await requests.decideAsKadep(req.params.id, req.user.sub, req.validated);
  const messages = {
    accepted: "Pengajuan disetujui",
    redirected: "Pengajuan dialihkan ke dosen lain",
    revision_requested: "Revisi diminta",
    rejected_by_kadep: "Pengajuan ditolak",
  };
  ok(res, data, messages[data.status]);
});

/** GET /thesis-proposals/supervisor-requests/:id */
export const getRequestDetail = handle(async (req, res) => ok(res, await requests.getRequestDetail(req.params.id, req.user.sub)));
