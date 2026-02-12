import multer from "multer";

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

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });
const thesisUpload = multer({ storage, fileFilter: thesisFileFilter, limits: { fileSize: 50 * 1024 * 1024 } });

export const uploadCsv = upload.single("file");
export const uploadThesisFile = thesisUpload.single("file");
export const uploadInternshipFile = thesisUpload.single("file");

export default upload;

