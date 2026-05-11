import { importStudentsExcel, importLecturersExcel, importUsersExcel, importAcademicYearsExcel, importStudentsCsvFromUpload, adminUpdateUser, adminUpdateStudent, adminUpdateLecturer, createAcademicYear, updateAcademicYear, adminCreateUser, getAcademicYears, getActiveAcademicYear, getUsers, getStudents, getLecturers, getStudentDetail, getLecturerDetail, createRoom, updateRoom, getRooms, deleteRoom } from "../services/adminfeatures.service.js";
import { getFailedThesesCount, getFailedTheses } from "../services/thesisStatus.service.js";
import { getPendingCount } from "../services/thesisChangeRequest.service.js";

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

export async function updateStudentByAdminController(req, res, next) {
	try {
		const { id } = req.params;
		const body = req.validated ?? req.body ?? {};
		const student = await adminUpdateStudent(id, body);
		res.status(200).json({ success: true, data: student });
	} catch (err) {
		next(err);
	}
}

export async function updateLecturerByAdminController(req, res, next) {
	try {
		const { id } = req.params;
		const body = req.validated ?? req.body ?? {};
		const lecturer = await adminUpdateLecturer(id, body);
		res.status(200).json({ success: true, data: lecturer });
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

export async function createRoomController(req, res, next) {
	try {
		const body = req.validated ?? req.body ?? {};
		const { name, location, capacity } = body;
		const room = await createRoom({ name, location, capacity });
		res.status(201).json({ success: true, room });
	} catch (err) {
		next(err);
	}
}

export async function updateRoomController(req, res, next) {
	try {
		const { id } = req.params;
		const body = req.validated ?? req.body ?? {};
		const { name, location, capacity } = body;
		const room = await updateRoom(id, { name, location, capacity });
		res.status(200).json({ success: true, room });
	} catch (err) {
		next(err);
	}
}

export async function getRoomsController(req, res, next) {
	try {
		const page = parseInt(req.query.page, 10) || 1;
		const limitRaw = req.query.limit ?? req.query.pageSize;
		const limit = parseInt(limitRaw, 10) || 10;
		const search = req.query.search || "";
		const status = req.query.status || "all";
		const result = await getRooms({ page, limit, search, status });
		res.status(200).json({
			success: true,
			message: "Berhasil mengambil data ruangan",
			data: result.data,
			total: result.total,
		});
	} catch (err) {
		next(err);
	}
}

export async function deleteRoomController(req, res, next) {
	try {
		const { id } = req.params;
		await deleteRoom(id);
		res.status(200).json({ success: true, message: "Ruangan berhasil dihapus" });
	} catch (err) {
		next(err);
	}
}

// Excel import controllers (JSON payload from frontend)
export async function importStudentsExcelController(req, res, next) {
	try {
		const result = await importStudentsExcel(req.body);
		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
}

export async function importLecturersExcelController(req, res, next) {
	try {
		const result = await importLecturersExcel(req.body);
		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
}

export async function importUsersExcelController(req, res, next) {
	try {
		const result = await importUsersExcel(req.body);
		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
}

export async function importAcademicYearsExcelController(req, res, next) {
	try {
		const result = await importAcademicYearsExcel(req.body);
		res.status(200).json(result);
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

export async function getStudentDetailController(req, res, next) {
	try {
		const { id } = req.params;
		const result = await getStudentDetail(id);
		res.status(200).json({ success: true, data: result });
	} catch (err) {
		next(err);
	}
}

export async function getLecturerDetailController(req, res, next) {
	try {
		const { id } = req.params;
		const result = await getLecturerDetail(id);
		res.status(200).json({ success: true, data: result });
	} catch (err) {
		next(err);
	}
}

export async function getThesisListController(req, res, next) {
	try {
		const page = parseInt(req.query.page) || 1;
		const pageSize = parseInt(req.query.pageSize) || 10;
		const search = req.query.search || "";
		const status = req.query.status || null;
		const result = await getThesisListForAdmin({ page, pageSize, search, status });
		res.status(200).json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function deleteThesisController(req, res, next) {
	try {
		const { id } = req.params;
		const { reason } = req.body || {};
		const result = await deleteThesis(id, reason, req.user?.sub);
		res.status(200).json(result);
	} catch (err) {
		next(err);
	}
}

/**
 * Get quick actions stats for Kadep dashboard
 */
export async function getKadepQuickActionsController(req, res, next) {
	try {
		const [failedCount, pendingChangeRequestsCount] = await Promise.all([
			getFailedThesesCount(),
			getPendingCount(),
		]);
		
		res.status(200).json({
			success: true,
			data: {
				failedThesesCount: failedCount,
				pendingChangeRequestsCount: pendingChangeRequestsCount,
			},
		});
	} catch (err) {
		next(err);
	}
}

/**
 * Get list of FAILED theses
 */
export async function getFailedThesesController(req, res, next) {
	try {
		const theses = await getFailedTheses();
		res.status(200).json({
			success: true,
			data: theses.map((t) => ({
				id: t.id,
				title: t.title,
				rating: t.rating,
				createdAt: t.createdAt,
				student: {
					id: t.student?.user?.id,
					fullName: t.student?.user?.fullName,
					nim: t.student?.user?.identityNumber,
					email: t.student?.user?.email,
				},
			})),
			total: theses.length,
		});
	} catch (err) {
		next(err);
	}
}

/**
 * Get thesis by ID (Admin)
 */
export async function getThesisByIdController(req, res, next) {
	try {
		const { id } = req.params;
		const thesis = await getThesisById(id);
		res.status(200).json({ success: true, data: thesis });
	} catch (err) {
		next(err);
	}
}

/**
 * Create thesis manually (Admin)
 */
export async function createThesisController(req, res, next) {
	try {
		const body = req.validated ?? req.body ?? {};
		const thesis = await createThesisManually({ ...body, actorUserId: req.user?.sub });
		res.status(201).json({ success: true, data: thesis });
	} catch (err) {
		next(err);
	}
}

/**
 * Update thesis (Admin)
 */
export async function updateThesisController(req, res, next) {
	try {
		const { id } = req.params;
		const body = req.validated ?? req.body ?? {};
		const thesis = await updateThesisManually(id, { ...body, actorUserId: req.user?.sub });
		res.status(200).json({ success: true, data: thesis });
	} catch (err) {
		next(err);
	}
}

/**
 * Get available students (without active thesis)
 */
export async function getAvailableStudentsController(req, res, next) {
	try {
		const students = await getAvailableStudents();
		res.status(200).json({ success: true, data: students });
	} catch (err) {
		next(err);
	}
}

/**
 * Get all lecturers for supervisor dropdown
 */
export async function getAllLecturersController(req, res, next) {
	try {
		const lecturers = await getAllLecturersForDropdown();
		res.status(200).json({ success: true, data: lecturers });
	} catch (err) {
		next(err);
	}
}

/**
 * Get supervisor roles
 */
export async function getSupervisorRolesController(req, res, next) {
	try {
		const roles = await getSupervisorRoles();
		res.status(200).json({ success: true, data: roles });
	} catch (err) {
		next(err);
	}
}

/**
 * Get thesis statuses
 */
export async function getThesisStatusesController(req, res, next) {
	try {
		const statuses = await getThesisStatuses();
		res.status(200).json({ success: true, data: statuses });
	} catch (err) {
		next(err);
	}
}
