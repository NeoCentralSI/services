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

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
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

  // Serve internship and general uploads statically
  app.use("/uploads/internship", express.static(path.join(uploadsDir, "internship")));
  app.use("/uploads/general", express.static(path.join(uploadsDir, "general")));

  console.log("📁 Serving protected thesis uploads and public internship/general uploads");
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
      const routeUrl = pathToFileURL(routePath).href; // needed on Windows
      const routeModule = await import(routeUrl);
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
