import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ENV } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** The same shape as dummy-SIA's `GET /students`, read when `SIA_MOCK` is on (and by the tests). */
export const SIA_MOCK_FIXTURE = path.resolve(__dirname, "../test/fixtures/sia-students.json");

/** Records asked per page; a SIA without pagination ignores it and returns everything. */
const PAGE_SIZE = 500;
const MAX_PAGES = 200;

const withTimeout = async (promise, ms) => {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("SIA request timed out")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
};

async function fetchPage(url, retries) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await withTimeout(
        fetch(url, { headers: { "Content-Type": "application/json", "x-api-token": ENV.SIA_API_TOKEN } }),
        ENV.SIA_FETCH_TIMEOUT || 10000,
      );
      if (!res.ok) throw new Error(`SIA fetch failed (${res.status}): ${await res.text()}`);
      const json = await res.json();
      if (!Array.isArray(json?.data)) throw new Error("SIA response missing data");
      return json;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️  SIA fetch attempt ${attempt}/${retries} failed:`, err.message);
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 10000)));
      }
    }
  }
  throw lastError;
}

/**
 * The academic records of the running semester from SIA (`GET /students`, K45), as SIA sends
 * them: `{ period, data }`. Pages are followed when SIA paginates. Retry with backoff and a
 * timeout per request. With `SIA_MOCK` the fixture of the same shape is read.
 * @returns {Promise<{ period: object|null, data: object[] }>}
 */
export async function fetchAcademicRecords(retries = 3) {
  if (ENV.SIA_MOCK) {
    const json = JSON.parse(fs.readFileSync(SIA_MOCK_FIXTURE, "utf-8"));
    return { period: json.period ?? null, data: json.data ?? [] };
  }
  if (!ENV.SIA_BASE_URL || !ENV.SIA_API_TOKEN) {
    throw new Error("SIA_BASE_URL or SIA_API_TOKEN not configured");
  }
  const base = `${ENV.SIA_BASE_URL.replace(/\/$/, "")}/students`;
  const data = [];
  let period = null;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const json = await fetchPage(`${base}?page=${page}&pageSize=${PAGE_SIZE}`, retries);
    period = period ?? json.period ?? null;
    data.push(...json.data);
    const totalPages = Number(json.pagination?.totalPages);
    if (!Number.isFinite(totalPages) || page >= totalPages) break;
  }
  return { period, data };
}

/** MD5 of one record, to skip unchanged records in the cache. */
export function hashStudent(student) {
  return crypto.createHash("md5").update(JSON.stringify(student)).digest("hex");
}
