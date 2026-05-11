const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://neocentral.dev",
  "https://www.neocentral.dev",
];

function normalizeOrigin(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function parseOriginList(value) {
  return String(value || "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);
}

export function buildAllowedCorsOrigins(env = process.env) {
  return [
    ...new Set([
      ...DEFAULT_ALLOWED_ORIGINS,
      ...parseOriginList(env.FRONTEND_URL),
      ...parseOriginList(env.CORS_ALLOWED_ORIGINS),
    ]),
  ];
}

export function createCorsOptions(env = process.env) {
  const allowedOrigins = new Set(buildAllowedCorsOrigins(env));

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      const normalizedOrigin = normalizeOrigin(origin);
      callback(null, allowedOrigins.has(normalizedOrigin) ? normalizedOrigin : false);
    },
    credentials: true,
  };
}
