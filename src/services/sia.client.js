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

export async function fetchStudentsFull() {
  if (!ENV.SIA_BASE_URL || !ENV.SIA_API_TOKEN) {
    throw new Error("SIA_BASE_URL or SIA_API_TOKEN not configured");
  }
  const url = `${ENV.SIA_BASE_URL.replace(/\/$/, "")}/students?full=true`;
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
}

export function hashStudent(student) {
  // Simple JSON hash via stable stringify; replace with crypto hash if needed.
  return Buffer.from(JSON.stringify(student)).toString("base64");
}
