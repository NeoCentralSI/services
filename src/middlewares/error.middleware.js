import generated from "../generated/prisma/index.js";

const { Prisma } = generated;

function mapPrismaError(err) {
  if (err?.statusCode) {
    return err;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2000") {
      const e = new Error("Data yang dimasukkan terlalu panjang.");
      e.statusCode = 400;
      e.code = err.code;
      return e;
    }

    if (err.code === "P2002") {
      const e = new Error("Data yang sama sudah tersimpan.");
      e.statusCode = 409;
      e.code = err.code;
      return e;
    }

    if (err.code === "P2003") {
      const e = new Error("Data referensi yang dipilih tidak ditemukan atau sudah tidak berlaku.");
      e.statusCode = 400;
      e.code = err.code;
      return e;
    }

    if (err.code === "P2025") {
      const e = new Error("Data yang diminta tidak ditemukan.");
      e.statusCode = 404;
      e.code = err.code;
      return e;
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    console.error("PrismaClientValidationError Details:", err.message);
    const e = new Error("Data permintaan tidak sesuai dengan konfigurasi sistem.");
    e.statusCode = 500;
    return e;
  }

  const message = err?.message || "";
  if (/Incorrect string value|Data too long|value too long/i.test(message)) {
    const e = new Error("Input tidak valid atau terlalu panjang");
    e.statusCode = 400;
    return e;
  }

  return err;
}

export default function errorHandler(err, req, res, next) {
  console.log("=== RAW ERROR ===", err);
  const mappedErr = mapPrismaError(err);

  // Jika error tidak punya statusCode → fallback 500
  const statusCode = mappedErr.statusCode || 500;

  // Log error di console (bisa ganti pakai logger util)
  if (process.env.NODE_ENV !== "test") {
    console.error("❌ Error:", mappedErr.message);
    if (mappedErr.stack) console.error(mappedErr.stack);
    // Log detail validasi agar mudah ditrace saat 400
    if (statusCode === 400 && mappedErr.details) {
      console.error("Validation details:", mappedErr.details);
    }
    if (err instanceof Prisma.PrismaClientValidationError) {
      console.error("Prisma Validation Error:", err.message);
    }
  }

  // Bentuk respons standar JSON
  const publicMessage = statusCode >= 500
    ? "Terjadi kesalahan pada sistem. Silakan coba lagi."
    : mappedErr.message;
  const payload = {
    success: false,
    status: statusCode,
    message: publicMessage || "Permintaan tidak dapat diproses.",
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
  };
  if (mappedErr.code) {
    payload.code = mappedErr.code;
  }
  if (statusCode === 400 && mappedErr.details) {
    payload.details = mappedErr.details;
  }
  res.status(statusCode).json(payload);
}