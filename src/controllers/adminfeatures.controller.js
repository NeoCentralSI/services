import { importStudentsCsvFromUpload, adminUpdateUser, createAcademicYear, updateAcademicYear, adminCreateUser, getAcademicYears, getActiveAcademicYear, getUsers, getStudents, getLecturers } from "../services/adminfeatures.service.js";

export async function importStudentsCsv(req, res, next) {
	try {
		const file = req.file;
		if (!file) {
			const err = new Error("CSV file is required (field name: file)");
			err.statusCode = 400;
			throw err;
		}
		const summary = await importStudentsCsvFromUpload(file.buffer);
		res.status(200).json({ success: true, summary });
	} catch (err) {
		next(err);
	}
}


export async function updateUserByAdmin(req, res, next) {
  try {
    const { id } = req.params;
		const body = req.validated ?? req.body ?? {};
		const { fullName, email, roles, identityNumber, identityType, isVerified } = body;
    const user = await adminUpdateUser(id, { fullName, email, roles, identityNumber, identityType, isVerified });
    res.status(200).json({ success: true, user });
  } catch (err) {
    next(err);
  }
}

export async function createUserByAdminController(req, res, next) {
	try {
		const body = req.validated ?? req.body ?? {};
		const { fullName, email, roles, identityNumber, identityType } = body;
		const result = await adminCreateUser({ fullName, email, roles, identityNumber, identityType });
		res.status(201).json({ success: true, user: result });
	} catch (err) {
		next(err);
	}
}

export async function createAcademicYearController(req, res, next) {
	try {
		const body = req.validated ?? req.body ?? {};
		const { semester, year, startDate, endDate } = body;
		const ay = await createAcademicYear({ semester, year, startDate, endDate });
		res.status(201).json({ success: true, academicYear: ay });
	} catch (err) {
		next(err);
	}
}

export async function updateAcademicYearController(req, res, next) {
	try {
		const { id } = req.params;
		const body = req.validated ?? req.body ?? {};
		const { semester, year, startDate, endDate, isActive } = body;
		const updated = await updateAcademicYear(id, { semester, year, startDate, endDate, isActive });
		res.status(200).json({ success: true, academicYear: updated });
	} catch (err) {
		next(err);
	}
}

export async function getAcademicYearsController(req, res, next) {
	try {
		const page = parseInt(req.query.page) || 1;
		const pageSize = parseInt(req.query.pageSize) || 10;
		const search = req.query.search || "";
		const result = await getAcademicYears({ page, pageSize, search });
		res.status(200).json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function getActiveAcademicYearController(req, res, next) {
	try {
		const active = await getActiveAcademicYear();
		res.status(200).json({ success: true, academicYear: active });
	} catch (err) {
		next(err);
	}
}

export async function getUsersController(req, res, next) {
	try {
		const page = parseInt(req.query.page) || 1;
		const pageSize = parseInt(req.query.pageSize) || 10;
		const search = req.query.search || "";
		const identityType = req.query.identityType || "";
		const role = req.query.role || "";
		const isVerified = req.query.isVerified !== undefined ? req.query.isVerified === 'true' : undefined;
		const result = await getUsers({ page, pageSize, search, identityType, role, isVerified });
		res.status(200).json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function getStudentsController(req, res, next) {
	try {
		const page = parseInt(req.query.page) || 1;
		const pageSize = parseInt(req.query.pageSize) || 10;
		const search = req.query.search || "";
		const result = await getStudents({ page, pageSize, search });
		res.status(200).json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function getLecturersController(req, res, next) {
	try {
		const page = parseInt(req.query.page) || 1;
		const pageSize = parseInt(req.query.pageSize) || 10;
		const search = req.query.search || "";
		const result = await getLecturers({ page, pageSize, search });
		res.status(200).json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}