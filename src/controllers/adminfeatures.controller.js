import { importStudentsExcel, importLecturersExcel, importUsersExcel, importAcademicYearsExcel, importStudentsCsvFromUpload, adminUpdateUser, createAcademicYear, updateAcademicYear, adminCreateUser, getAcademicYears, getActiveAcademicYear, getUsers, getStudents, getLecturers, getStudentDetail, getLecturerDetail, adminUpdateLecturer, adminUpdateStudent, createRoom, updateRoom, getRooms, deleteRoom, getSeminarResultThesisOptions, getSeminarResultLecturerOptions, getSeminarResultStudentOptions, getSeminarResults, getSeminarResultDetail, createSeminarResult, updateSeminarResult, deleteSeminarResult, getSeminarResultAudienceLinks, assignSeminarResultAudiences, removeSeminarResultAudienceLink } from "../services/adminfeatures.service.js";
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

export async function getSeminarResultAudienceLinksController(req, res, next) {
	try {
		const page = parseInt(req.query.page) || 1;
		const pageSize = parseInt(req.query.pageSize) || 10;
		const search = req.query.search || "";
		const result = await getSeminarResultAudienceLinks({ page, pageSize, search });
		res.status(200).json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function assignSeminarResultAudiencesController(req, res, next) {
	try {
		const body = req.validated ?? req.body ?? {};
		const result = await assignSeminarResultAudiences(body);
		res.status(200).json({ success: true, data: result });
	} catch (err) {
		next(err);
	}
}

export async function removeSeminarResultAudienceLinkController(req, res, next) {
	try {
		const { seminarId, studentId } = req.params;
		await removeSeminarResultAudienceLink({ seminarId, studentId });
		res.status(200).json({ success: true, message: "Relasi audience berhasil dihapus" });
	} catch (err) {
		next(err);
	}
}

export async function getUsersController(req, res, next) {
	try {
		const page = parseInt(req.query.page) || 1;
		const pageSize = req.query.pageSize !== undefined ? parseInt(req.query.pageSize) : 10;
		const search = req.query.search || "";
		const identityType = req.query.identityType || "";
		const role = req.query.role || "";
		const isVerified = req.query.isVerified !== undefined ? req.query.isVerified === 'true' : undefined;
		const enrollmentYear = req.query.enrollmentYear;
		const result = await getUsers({ page, pageSize, search, identityType, role, isVerified, enrollmentYear });
		res.status(200).json({ success: true, ...result });
	} catch (err) {
		next(err);
	}
}

export async function getStudentsController(req, res, next) {
	try {
		const page = parseInt(req.query.page) || 1;
		const pageSize = req.query.pageSize !== undefined ? parseInt(req.query.pageSize) : 10;
		const search = req.query.search || "";
		const enrollmentYear = req.query.enrollmentYear;
		const result = await getStudents({ page, pageSize, search, enrollmentYear });
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

// Removed Science Group controllers
export async function updateLecturerByAdminController(req, res, next) { try { const result = await adminUpdateLecturer(req.params.id, req.body); res.status(200).json({ success: true, data: result }); } catch (err) { next(err); } }

export async function updateStudentByAdminController(req, res, next) { try { const result = await adminUpdateStudent(req.params.id, req.body); res.status(200).json({ success: true, data: result }); } catch (err) { next(err); } }

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
