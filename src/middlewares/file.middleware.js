import multer from "multer";

const storage = multer.memoryStorage();

const MAX_UPLOAD_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_GUIDANCE_FORM_SIZE = 25 * 1024 * 1024; // 25 MB untuk form bimbingan

function csvFileFilter(req, file, cb) {
	const okMime = [
		"text/csv",
		"application/csv",
		"text/plain",
		"application/vnd.ms-excel",
	];
	const isCsv = okMime.includes(file.mimetype) || (file.originalname || "").toLowerCase().endsWith(".csv");
	if (!isCsv) return cb(new Error("Only CSV files are allowed"));
	cb(null, true);
}

function thesisFileFilter(req, file, cb) {
	// Restrict thesis uploads to PDF only so they can be previewed inline
	const name = (file.originalname || "").toLowerCase();
	const isPdf = file.mimetype === "application/pdf" && name.endsWith(".pdf");
	if (!isPdf) return cb(new Error("Only PDF files are allowed for thesis uploads"));
	cb(null, true);
}

function seminarDocFileFilter(req, file, cb) {
	const name = (file.originalname || "").toLowerCase();
	const allowedMimes = [
		"application/pdf",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
	];
	const allowedExts = [".pdf", ".ppt", ".pptx"];
	const isAllowed = allowedMimes.includes(file.mimetype) || allowedExts.some((ext) => name.endsWith(ext));
	if (!isAllowed) return cb(new Error("Only PDF and PPT/PPTX files are allowed for seminar documents"));
	cb(null, true);
}

function guideFileFilter(req, file, cb) {
	// Allow PDF and Word documents for SOPs and Templates
	const allowedMimes = [
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document"
	];
	const isAllowed = allowedMimes.includes(file.mimetype) ||
		/\.(pdf|doc|docx)$/i.test(file.originalname || "");

	if (!isAllowed) return cb(new Error("Hanya file PDF, DOC, atau DOCX yang diperbolehkan"));
	cb(null, true);
}

/**
 * Filter konservatif untuk upload metopen task submit / form bimbingan.
 * Membolehkan tipe akademik umum (PDF, Word, Excel, PowerPoint, image, archive).
 * Eksekusi/script ditolak.
 */
function safeAcademicFileFilter(req, file, cb) {
	const name = (file.originalname || "").toLowerCase();
	const allowedMimes = new Set([
		"application/pdf",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.ms-excel",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.ms-powerpoint",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"text/csv",
		"text/plain",
		"image/png",
		"image/jpeg",
		"image/jpg",
		"image/webp",
		"image/gif",
		"application/zip",
		"application/x-zip-compressed",
	]);
	const allowedExt = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|png|jpg|jpeg|webp|gif|zip)$/i;
	const blockedExt = /\.(exe|bat|cmd|sh|js|mjs|cjs|ts|tsx|html?|php|py|rb|jar|com|scr|msi|ps1)$/i;

	if (blockedExt.test(name)) {
		return cb(new Error("Tipe file tidak diperbolehkan untuk diunggah"));
	}
	const ok = allowedMimes.has(file.mimetype) || allowedExt.test(name);
	if (!ok) return cb(new Error("Tipe file tidak diperbolehkan"));
	cb(null, true);
}

const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_SIZE } });
const thesisUpload = multer({ storage, fileFilter: thesisFileFilter, limits: { fileSize: MAX_UPLOAD_SIZE } });
const seminarDocUpload = multer({ storage, fileFilter: seminarDocFileFilter, limits: { fileSize: MAX_UPLOAD_SIZE } });
const guideUpload = multer({ storage, fileFilter: guideFileFilter, limits: { fileSize: MAX_UPLOAD_SIZE } });
const safeAcademicUpload = multer({
	storage,
	fileFilter: safeAcademicFileFilter,
	limits: { fileSize: MAX_UPLOAD_SIZE, files: 10 },
});
const guidanceFormUpload = multer({
	storage,
	fileFilter: safeAcademicFileFilter,
	limits: { fileSize: MAX_GUIDANCE_FORM_SIZE, files: 5 },
});

export const uploadCsv = upload.single("file");
export const uploadThesisFile = thesisUpload.single("file");
export const uploadInternshipFile = thesisUpload.single("file");
export const uploadSeminarDocFile = seminarDocUpload.single("file");
export const uploadGuideFile = guideUpload.single("file");
export const uploadYudisiumDocFile = thesisUpload.single("file");

/**
 * Metopen task submit: max 10 files dengan filter file akademik aman dan
 * ukuran maksimum 50 MB per file. Tetap menerima beragam format umum (Office,
 * PDF, image, archive) tetapi menolak file eksekusi/script.
 */
export const uploadMetopenSubmit = safeAcademicUpload.array("files", 10);

/**
 * Parse multipart/form-data for guidance request so req.body is populated.
 * Used when client sends FormData (e.g. from RequestGuidanceDialog with optional file).
 * When Content-Type is application/json, express.json() already parsed body; this no-ops.
 *
 * Filter: file akademik aman, max 25 MB per file, max 5 attachment per submission.
 */
export const parseGuidanceRequestForm = (req, res, next) => {
	if (req.is("multipart/form-data")) {
		return guidanceFormUpload.any()(req, res, (err) => {
			if (err) return next(err);
			next();
		});
	}
	next();
};

export default upload;
