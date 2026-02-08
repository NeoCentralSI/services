import {
	getAvailableSupervisor2Service,
	requestSupervisor2Service,
	getPendingSupervisor2RequestService,
	cancelSupervisor2RequestService,
	getSupervisor2RequestsService,
	approveSupervisor2RequestService,
	rejectSupervisor2RequestService,
} from "../../services/thesisGuidance/supervisor2.service.js";

// ─── Student controllers ───────────────────────────────────────────────────

export async function getAvailableSupervisor2(req, res, next) {
	try {
		const lecturers = await getAvailableSupervisor2Service(req.user.sub);
		res.json({ success: true, data: lecturers });
	} catch (err) {
		next(err);
	}
}

export async function requestSupervisor2(req, res, next) {
	try {
		const { lecturerId } = req.body;
		const result = await requestSupervisor2Service(req.user.sub, { lecturerId });
		res.status(201).json({
			success: true,
			message: `Permintaan Pembimbing 2 telah dikirim ke ${result.lecturerName}`,
			data: result,
		});
	} catch (err) {
		next(err);
	}
}

export async function getPendingSupervisor2Request(req, res, next) {
	try {
		const result = await getPendingSupervisor2RequestService(req.user.sub);
		res.json({ success: true, data: result });
	} catch (err) {
		next(err);
	}
}

export async function cancelSupervisor2Request(req, res, next) {
	try {
		const result = await cancelSupervisor2RequestService(req.user.sub);
		res.json({ success: true, message: "Permintaan Pembimbing 2 dibatalkan", data: result });
	} catch (err) {
		next(err);
	}
}

// ─── Lecturer controllers ──────────────────────────────────────────────────

export async function getSupervisor2Requests(req, res, next) {
	try {
		const requests = await getSupervisor2RequestsService(req.user.sub);
		res.json({ success: true, data: requests });
	} catch (err) {
		next(err);
	}
}

export async function approveSupervisor2Request(req, res, next) {
	try {
		const { requestId } = req.params;
		const result = await approveSupervisor2RequestService(req.user.sub, requestId);
		res.json({
			success: true,
			message: "Permintaan Pembimbing 2 disetujui",
			data: result,
		});
	} catch (err) {
		next(err);
	}
}

export async function rejectSupervisor2Request(req, res, next) {
	try {
		const { requestId } = req.params;
		const { reason } = req.body;
		const result = await rejectSupervisor2RequestService(req.user.sub, requestId, { reason });
		res.json({
			success: true,
			message: "Permintaan Pembimbing 2 ditolak",
			data: result,
		});
	} catch (err) {
		next(err);
	}
}
