import express from "express";
import { authGuard, requireRole } from "../../middlewares/auth.middleware.js";
import { ROLES } from "../../constants/roles.js";
import * as supervisor2Service from "../../services/thesisGuidance/supervisor2.service.js";

/**
 * Final approval of a Pembimbing 2 request by the Head of Department (proposal phase).
 * Moved out of the former research-method router when the proposal flow was rebuilt; paths and behaviour are unchanged.
 */
const router = express.Router();

router.get("/supervisor2-requests", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), async (req, res, next) => {
  try {
    const data = await supervisor2Service.getSupervisor2KadepQueueService(req.user.sub);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

router.post("/supervisor2-requests/:id/approve", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), async (req, res, next) => {
  try {
    const data = await supervisor2Service.decideSupervisor2ByKadepService(req.user.sub, req.params.id, { approve: true });
    res.json({ success: true, data, message: "Pembimbing 2 disetujui. Perbarui Penetapan Pembimbing periode ini bila sudah pernah diterbitkan." });
  } catch (err) { next(err); }
});

router.post("/supervisor2-requests/:id/reject", authGuard, requireRole(ROLES.KETUA_DEPARTEMEN), async (req, res, next) => {
  try {
    const data = await supervisor2Service.decideSupervisor2ByKadepService(req.user.sub, req.params.id, { approve: false, reason: req.body.reason });
    res.json({ success: true, data, message: "Permintaan Pembimbing 2 tidak disetujui." });
  } catch (err) { next(err); }
});

export default router;
