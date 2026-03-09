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
  if (ENV.SIA_MOCK) {
    console.log("⚡ SIA MOCK MODE: Returning dummy student data");
    return [
      {
        nim: "2111521001",
        name: "Aditya Pratama",
        sksCompleted: 110,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4101", name: "Tugas Akhir", credits: 6 },
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 }
        ]
      },
      {
        nim: "2111521002",
        name: "Budi Santoso",
        sksCompleted: 105,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: false,
        internshipCompleted: false,
        kknCompleted: false,
        currentSemester: 6,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 }
        ]
      },
      {
        nim: "2111521003",
        name: "Citra Lestari",
        sksCompleted: 115,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: false,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4101", name: "Tugas Akhir", credits: 6 }
        ]
      },
      {
        nim: "2211523034",
        name: "Fariz",
        sksCompleted: 115,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: false,
        kknCompleted: false,
        currentSemester: 6,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
          { code: "TIF4101", name: "Tugas Akhir", credits: 6 }
        ]
      }
    ];
  }

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
