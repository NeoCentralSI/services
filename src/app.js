import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";
import swaggerUi from "swagger-ui-express";
import errorHandler from "./middlewares/error.middleware.js";
import dateFormatMiddleware from "./middlewares/dateFormat.middleware.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
// Include weekday (Indonesian) in all formatted date fields
app.use(dateFormatMiddleware({ withSeconds: false, withDay: true }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const docsDir = path.join(__dirname, "docs");
  const openapiJsonPath = path.join(docsDir, "openapi-schema.json");
  let openapiDoc = null;
  if (fs.existsSync(openapiJsonPath)) {
    try {
      openapiDoc = JSON.parse(fs.readFileSync(openapiJsonPath, "utf-8"));
      if (!openapiDoc?.openapi && !openapiDoc?.swagger) {
        // Not an OpenAPI document, ignore so we fallback to YAML
        openapiDoc = null;
      }
    } catch (err) {
      console.warn("Failed to parse openapi-schema.json, falling back to YAML:", err.message);
    }
  }

  app.use("/docs", express.static(docsDir));
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(
      openapiDoc || null,
      openapiDoc ? {} : { swaggerOptions: { url: "/docs/openapi.yaml" } }
    )
  );
  console.log("Swagger UI available at /docs");
} catch (err) {
  console.warn("Swagger UI disabled; failed to initialize Swagger UI:", err.message);
}


try {
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsDir));
  console.log("📁 Serving uploads at /uploads");
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

app.get("/", (req, res) => {
  res.json({ message: "API is running 🚀" });
});


// Serve OpenAPI spec directly at root for Swagger UI/manual access
app.get("/openapi.yaml", (req, res) => {
  const specPath = path.join(__dirname, "docs", "openapi.yaml");
  res.sendFile(specPath);
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
