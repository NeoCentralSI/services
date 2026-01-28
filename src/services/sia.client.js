import crypto from "crypto";
import { ENV } from "../config/env.js";

const defaultHeaders = {
  "Content-Type": "application/json",
};

const withTimeout = async (promise, ms) => {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error("SIA request timed out")), ms)
  );
  return Promise.race([promise, timeout]);
};

/**
 * Fetch all students with full data from SIA API
 * Supports retry with exponential backoff
 */
export async function fetchStudentsFull(retries = 3) {
  if (!ENV.SIA_BASE_URL || !ENV.SIA_API_TOKEN) {
    throw new Error("SIA_BASE_URL or SIA_API_TOKEN not configured");
  }
  
  const url = `${ENV.SIA_BASE_URL.replace(/\/$/, "")}/students?full=true`;
  let lastError;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const req = fetch(url, {
        headers: {
          ...defaultHeaders,
          "x-api-token": ENV.SIA_API_TOKEN,
        },
      });
      const res = await withTimeout(req, ENV.SIA_FETCH_TIMEOUT || 10000);
      
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`SIA fetch failed (${res.status}): ${body}`);
      }
      
      const json = await res.json();
      if (!json?.data) {
        throw new Error("SIA response missing data");
      }
      
      return json.data;
    } catch (err) {
      lastError = err;
      console.warn(`⚠️  SIA fetch attempt ${attempt}/${retries} failed:`, err.message);
      
      // If not last attempt, wait with exponential backoff
      if (attempt < retries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

/**
 * Generate MD5 hash of student data for change detection
 */
export function hashStudent(student) {
  return crypto
    .createHash("md5")
    .update(JSON.stringify(student))
    .digest("hex");
}
