import * as service from "../services/supervisionQuota.service.js";

export async function getDefaultQuotaController(req, res, next) {
	try {
		const { academicYearId } = req.params;
		const data = await service.getDefaultQuota(academicYearId);
		res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
}

export async function setDefaultQuotaController(req, res, next) {
	try {
		const { academicYearId } = req.params;
		const body = req.validated ?? req.body ?? {};
		const result = await service.setDefaultQuota(academicYearId, body);
		res.status(200).json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function getLecturerQuotasController(req, res, next) {
	try {
		const { academicYearId } = req.params;
		const search = req.query.search || "";
		const data = await service.getLecturerQuotas(academicYearId, search);
		res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
}

export async function updateLecturerQuotaController(req, res, next) {
	try {
		const { lecturerId, academicYearId } = req.params;
		const body = req.validated ?? req.body ?? {};
		const data = await service.updateLecturerQuota(lecturerId, academicYearId, body);
		res.status(200).json({ success: true, data });
	} catch (err) {
		next(err);
	}
}
