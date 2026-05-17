// src/config/env.js
import dotenv from "dotenv";

dotenv.config(); // load file .env

// helper kecil untuk parsing tipe data
const toBool = (val) => String(val).toLowerCase() === "true";
const toNum = (val, def = 0) => (val ? Number(val) : def);

export const ENV = {
  // ===============================
  // 🌐 SERVER CONFIGURATION
  // ===============================
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: toNum(process.env.PORT, 3000),
  BASE_URL: process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`,
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",

  // ===============================
  // 🗄️ DATABASE (Prisma)f
  // ===============================
  DATABASE_URL: process.env.DATABASE_URL,

  // ===============================
  // 🧠 REDIS CONFIG
  // ===============================
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  GOTENBERG_URL: process.env.GOTENBERG_URL || "http://localhost:3001",

  // ===============================
  // 📧 SMTP / EMAIL CONFIG
  // ===============================
  SMTP_HOST: process.env.SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: toNum(process.env.SMTP_PORT, 587),
  SMTP_SECURE: toBool(process.env.SMTP_SECURE),
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASS: process.env.SMTP_PASS || "",
  SMTP_FROM: process.env.SMTP_FROM || "",

  // ===============================
  // 🔐 AUTH
  // ===============================
  JWT_SECRET: process.env.JWT_SECRET || "",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || "",
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  // Dummy academic token (local JSON service)
  ACADEMIC_API_TOKEN: process.env.ACADEMIC_API_TOKEN || "dev-academic-token",

  // ===============================
  // External SIA fetch
  // ===============================
  SIA_BASE_URL: process.env.SIA_BASE_URL || "http://localhost:4000",
  SIA_API_TOKEN: process.env.SIA_API_TOKEN || "",
  SIA_FETCH_TIMEOUT: toNum(process.env.SIA_FETCH_TIMEOUT, 10000), // ms
  SIA_CHUNK_SIZE: toNum(process.env.SIA_CHUNK_SIZE, 200),
  ENABLE_SIA_CRON: toBool(process.env.ENABLE_SIA_CRON),

  // ===============================
  // 🕒 CRON JOBS
  // ===============================
  CRON_TIME_NOTIFY: process.env.CRON_TIME_NOTIFY || "0 * * * *",
  ENABLE_CRON: toBool(process.env.ENABLE_CRON),
  // Thesis status cron controls
  THESIS_STATUS_CRON: process.env.THESIS_STATUS_CRON || "30 2 * * *", // 02:30 every day
  THESIS_STATUS_TZ: process.env.THESIS_STATUS_TZ || "Asia/Jakarta", // WIB (UTC+7)
  // Guidance reminder cron controls
  GUIDANCE_REMINDER_CRON: process.env.GUIDANCE_REMINDER_CRON || "0 7 * * *", // 07:00 every day
  GUIDANCE_REMINDER_TZ: process.env.GUIDANCE_REMINDER_TZ || "Asia/Jakarta", // WIB (UTC+7)
  // Daily thesis reminder cron controls (for active thesis students)
  DAILY_THESIS_REMINDER_CRON: process.env.DAILY_THESIS_REMINDER_CRON || "0 9 * * *", // 09:00 every day
  DAILY_THESIS_REMINDER_TZ: process.env.DAILY_THESIS_REMINDER_TZ || "Asia/Jakarta", // WIB (UTC+7)
  // Academic event and yudisium lifecycle reminders
  ACADEMIC_EVENT_H_MINUS_ONE_CRON: process.env.ACADEMIC_EVENT_H_MINUS_ONE_CRON || "0 18 * * *", // H-1 18:00 WIB
  ACADEMIC_EVENT_DAY_CRON: process.env.ACADEMIC_EVENT_DAY_CRON || "0 7 * * *", // Hari H 07:00 WIB
  ACADEMIC_EVENT_REMINDER_TZ: process.env.ACADEMIC_EVENT_REMINDER_TZ || "Asia/Jakarta",
  YUDISIUM_REGISTRATION_CLOSING_REMINDER_CRON:
    process.env.YUDISIUM_REGISTRATION_CLOSING_REMINDER_CRON || "0 12 * * *", // H-1 close 12:00 WIB
  YUDISIUM_REGISTRATION_OPEN_REMINDER_CRON:
    process.env.YUDISIUM_REGISTRATION_OPEN_REMINDER_CRON || "0 6 * * *", // Open date 06:00 WIB
  YUDISIUM_REGISTRATION_CLOSED_REMINDER_CRON:
    process.env.YUDISIUM_REGISTRATION_CLOSED_REMINDER_CRON || "0 6 * * *", // Close date 06:00 WIB
  YUDISIUM_REGISTRATION_REMINDER_TZ: process.env.YUDISIUM_REGISTRATION_REMINDER_TZ || "Asia/Jakarta",
  EXAMINER_NO_RESPONSE_REMINDER_CRON:
    process.env.EXAMINER_NO_RESPONSE_REMINDER_CRON || "0 8 * * *", // H+3 assignment 08:00 WIB
  EXAMINER_NO_RESPONSE_REMINDER_TZ: process.env.EXAMINER_NO_RESPONSE_REMINDER_TZ || "Asia/Jakarta",

  // ===============================
  // 🎓 SEMINAR THRESHOLDS (Testing)
  // ===============================
  SEMINAR_MIN_BIMBINGAN: toNum(process.env.SEMINAR_MIN_BIMBINGAN, 8),
  SEMINAR_MIN_KEHADIRAN: toNum(process.env.SEMINAR_MIN_KEHADIRAN, 8),

  // ===============================
  // 🧰 LOGGING
  // ===============================
  LOG_LEVEL: process.env.LOG_LEVEL || "debug",
  LOG_TO_FILE: toBool(process.env.LOG_TO_FILE),

  // ===============================
  // 💌 META
  // ===============================
  APP_NAME: process.env.APP_NAME || "Backend API",
  APP_OWNER: process.env.APP_OWNER || "Orang Sigma",

  // ===============================
  // 🔔 FCM (Firebase Cloud Messaging)
  // ===============================
  // Pilih salah satu cara konfigurasi kredensial Admin SDK:
  // 1) FCM_SERVICE_ACCOUNT_JSON -> string JSON service account utuh
  // 2) Atau tiga variabel terpisah di bawah
  FCM_SERVICE_ACCOUNT_JSON: process.env.FCM_SERVICE_ACCOUNT_JSON || "",
  FCM_PROJECT_ID: process.env.FCM_PROJECT_ID || "",
  FCM_CLIENT_EMAIL: process.env.FCM_CLIENT_EMAIL || "",
  FCM_PRIVATE_KEY: process.env.FCM_PRIVATE_KEY || "",

  // ===============================
  // 🔐 Microsoft OAuth2 Credentials
  // ===============================
  CLIENT_ID: process.env.CLIENT_ID || "",
  CLIENT_SECRET: process.env.CLIENT_SECRET || "",
  TENANT_ID: process.env.TENANT_ID || "",
  REDIRECT_URI: process.env.REDIRECT_URI || "",
  SESSION_KEY: process.env.SESSION_KEY || "",
};

// 🚨 Validasi sederhana: pastikan variabel penting terisi
const required = ["DATABASE_URL", "JWT_SECRET", "REFRESH_TOKEN_SECRET"];
for (const key of required) {
  if (!ENV[key]) {
    console.error(`❌ Missing required env variable: ${key}`);
    process.exit(1);
  }
}
