import multer from "multer";
import { ENV } from "../config/env.js";

const storage = multer.memoryStorage();

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
	const isPdf = file.mimetype === "application/pdf" || (file.originalname || "").toLowerCase().endsWith(".pdf");
	if (!isPdf) return cb(new Error("Only PDF files are allowed for thesis uploads"));
	cb(null, true);
}

function seminarDocFileFilter(req, file, cb) {
	const isPdf = file.mimetype === "application/pdf" && (file.originalname || "").toLowerCase().endsWith(".pdf");
	if (!isPdf) {
		const error = new Error("Format dokumen tidak didukung. Gunakan file PDF.");
		error.statusCode = 400;
		return cb(error);
	}
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

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
const thesisUpload = multer({ storage, fileFilter: thesisFileFilter, limits: { fileSize: 50 * 1024 * 1024 } });
const seminarDocUpload = multer({
	storage,
	fileFilter: seminarDocFileFilter,
	limits: { fileSize: ENV.REQUIREMENT_DOCUMENT_MAX_SIZE_MB * 1024 * 1024 },
});
const guideUpload = multer({ storage, fileFilter: guideFileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

export const uploadCsv = upload.single("file");
export const uploadThesisFile = thesisUpload.single("file");
export const uploadInternshipFile = thesisUpload.single("file");
export const uploadSeminarDocFile = seminarDocUpload.single("file");
export const uploadGuideFile = guideUpload.single("file");
export const uploadYudisiumDocFile = thesisUpload.single("file");
export const uploadCplRepairFiles = thesisUpload.fields([
  { name: "recommendation", maxCount: 1 },
  { name: "settlement", maxCount: 1 },
]);

export default upload;

