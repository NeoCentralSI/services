import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import errorHandler from "./middlewares/error.middleware.js";
import dateFormatMiddleware from "./middlewares/dateFormat.middleware.js";
import { authGuard } from "./middlewares/auth.middleware.js";
import { checkThesisFileAccess } from "./middlewares/fileAccess.middleware.js";

const app = express();

app.use(cors({
  origin: process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : "http://localhost:5173",
  credentials: true,
}));
app.use(express.json());
app.use(morgan("dev"));
app.use((req, res, next) => {
  const writeLocked = ["true", "1", "yes"].includes(
    String(process.env.SIMPTA_WRITE_LOCK || process.env.MAINTENANCE_MODE || "").toLowerCase(),
  );
  if (!writeLocked || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  return res.status(503).json({
    success: false,
    message: "Sistem sedang maintenance/migrasi. Operasi tulis sementara dikunci.",
  });
});
// Include weekday (Indonesian) in all formatted date fields
app.use(dateFormatMiddleware({ withSeconds: false, withDay: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  // Protect thesis uploads with authGuard and custom access logic
  app.use("/uploads/thesis", authGuard, checkThesisFileAccess, express.static(path.join(uploadsDir, "thesis")));

  // Protect yudisium uploads with authGuard
  app.use("/uploads/yudisium", authGuard, express.static(path.join(uploadsDir, "yudisium")));

  // Internship and metopen uploads now require authentication (basic gate).
  app.use("/uploads/internship", authGuard, express.static(path.join(uploadsDir, "internship")));
  app.use("/uploads/metopen", authGuard, express.static(path.join(uploadsDir, "metopen")));
  app.use("/uploads/logbooks", authGuard, express.static(path.join(uploadsDir, "logbooks")));
  app.use("/uploads/field-assessments", authGuard, express.static(path.join(uploadsDir, "field-assessments")));
  app.use("/uploads/documents", authGuard, (_req, res) => {
    res.status(404).json({
      success: false,
      message: "Akses dokumen akademik harus melalui endpoint /documents/:id/download",
    });
  });

  console.log("📁 Serving authenticated uploads (thesis, yudisium, metopen, internship) and guarded document downloads via /documents/:id/download");
} catch (err) {
  console.warn("⚠️ Failed to set up static uploads serving:", err.message);
}

const routesPath = path.join(__dirname, "routes");

try {
  const routeFiles = fs
    .readdirSync(routesPath)
    .filter((f) => f.endsWith(".route.js"));
  const mounted = [];
  for (const file of routeFiles) {
    try {
      const routePath = path.join(routesPath, file);
      // Use relative path for dynamic import - more compatible with Vite/Vitest
      const routeModule = await import(`./routes/${file}`);
      const routeName = file.replace(".route.js", "");
      if (!routeModule?.default) {
        console.warn(`⚠️ Route file ${file} has no default export, skipping`);
        continue;
      }
      app.use(`/${routeName}`, routeModule.default);
      mounted.push(`/${routeName}`);
      console.log(`🧭 Loaded route: /${routeName}`);
    } catch (err) {
      console.error(`❌ Failed to load route file ${file}:`, err.stack || err.message);
    }
  }
  console.log(`🧩 Routes mounted (${mounted.length}): ${mounted.join(", ") || "(none)"}`);
} catch (e) {
  console.error("❌ Failed scanning routes directory:", e.stack || e.message);
}

// Health check – used by Docker HEALTHCHECK and load balancers
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    env: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (req, res) => {
  res.json({ message: "API is running 🚀" });
});

app.use((req, res, next) => {
  const msg = `Route not found: ${req.method} ${req.originalUrl}`;
  console.warn(`🛑 404 → ${msg}`);
  const err = new Error(msg);
  err.statusCode = 404;
  next(err);
});

app.use(errorHandler);

export default app;
