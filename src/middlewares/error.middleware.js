export default function errorHandler(err, req, res, next) {
  // Jika error tidak punya statusCode → fallback 500
  const statusCode = err.statusCode || 500;

  // Log error di console (bisa ganti pakai logger util)
  if (process.env.NODE_ENV !== "test") {
    console.error("❌ Error:", err.message);
    if (err.stack) console.error(err.stack);
    // Log detail validasi agar mudah ditrace saat 400
    if (statusCode === 400 && err.details) {
      console.error("Validation details:", err.details);
    }
  }

  // Bentuk respons standar JSON
  const payload = {
    success: false,
    status: statusCode,
    message: err.message || "Internal Server Error",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };
  if (err.code) {
    payload.code = err.code;
  }
  if (statusCode === 400 && err.details) {
    payload.details = err.details;
  }
  res.status(statusCode).json(payload);
}