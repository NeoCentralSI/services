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
      // ── Grup 1: mengambil Metode Penelitian
      {
        nim: "2211522029",
        name: "Nofaldi",
        sksCompleted: 130,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4101", name: "Tugas Akhir", credits: 4 },
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211522055",
        name: "Eka Fitriani",
        sksCompleted: 130,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211521054",
        name: "Dedi Kurniawan",
        sksCompleted: 130,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211523053",
        name: "Cindy Permata Sari",
        sksCompleted: 130,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211522052",
        name: "Budi Hartono",
        sksCompleted: 130,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211523034",
        name: "Muhammad Fariz",
        sksCompleted: 122,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211522018",
        name: "Nabil Rizki Navisa",
        sksCompleted: 137,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4101", name: "Tugas Akhir", credits: 4 },
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211523030",
        name: "Khalied Nauly Maturino",
        sksCompleted: 141,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211522036",
        name: "Mustafa Fathur Rahman",
        sksCompleted: 137,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211521020",
        name: "Muhammad Nouval Habibie",
        sksCompleted: 137,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211523012",
        name: "Syauqi",
        sksCompleted: 125,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211522103",
        name: "Test Tanpa Thesis",
        sksCompleted: 130,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      // ── Grup 2: Sudah TA (mengambil Tugas Akhir + Metode Penelitian) ──
      {
        nim: "2211523022",
        name: "Daffa Agustian Saadi",
        sksCompleted: 137,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4101", name: "Tugas Akhir", credits: 4 },
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211522028",
        name: "Ilham",
        sksCompleted: 137,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4101", name: "Tugas Akhir", credits: 4 },
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211522101",
        name: "Test Ganti Topik",
        sksCompleted: 130,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4101", name: "Tugas Akhir", credits: 4 },
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      {
        nim: "2211522102",
        name: "Test Ganti Dospem",
        sksCompleted: 130,
        mandatoryCoursesCompleted: true,
        mkwuCompleted: true,
        internshipCompleted: true,
        kknCompleted: true,
        currentSemester: 8,
        currentSemesterCourses: [
          { code: "TIF4101", name: "Tugas Akhir", credits: 4 },
          { code: "TIF4102", name: "Metodologi Penelitian", credits: 3 },
        ],
      },
      // ── Grup 3: Belum eligible (SKS belum cukup) ──
      {
        nim: "2311523026",
        name: "Dimas",
        sksCompleted: 99,
        mandatoryCoursesCompleted: false,
        mkwuCompleted: false,
        internshipCompleted: false,
        kknCompleted: false,
        currentSemester: 5,
        currentSemesterCourses: [],
      },
      {
        nim: "2411522001",
        name: "John",
        sksCompleted: 60,
        mandatoryCoursesCompleted: false,
        mkwuCompleted: false,
        internshipCompleted: false,
        kknCompleted: false,
        currentSemester: 3,
        currentSemesterCourses: [],
      },
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
 * Per-semester academic data (plan 10.6): `GET /enrollments?academicYear=&semester=` returns,
 * per student of that semester, whether they take Metode Penelitian and Tugas Akhir. Read only.
 * In mock mode the course lists of the mock students stand in for the semester data.
 * @returns {Promise<Array<{ nim: string, studentStatus?: string, takesResearchMethod: boolean, takesThesis: boolean }>>}
 */
export async function fetchSemesterEnrollments({ academicYear, semester }, retries = 3) {
  if (ENV.SIA_MOCK) {
    const students = await fetchStudentsFull(1);
    const takes = (s, re) => (s.currentSemesterCourses ?? []).some((c) => re.test(String(c?.name ?? "")));
    return students.map((s) => ({
      nim: s.nim,
      studentStatus: "aktif",
      takesResearchMethod: takes(s, /metod(e|ologi) penelitian/i),
      takesThesis: takes(s, /tugas akhir|skripsi/i),
    }));
  }
  if (!ENV.SIA_BASE_URL || !ENV.SIA_API_TOKEN) {
    throw new Error("SIA_BASE_URL or SIA_API_TOKEN not configured");
  }
  const query = new URLSearchParams({ academicYear: String(academicYear), semester: String(semester) });
  const url = `${ENV.SIA_BASE_URL.replace(/\/$/, "")}/enrollments?${query}`;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await withTimeout(fetch(url, { headers: { ...defaultHeaders, "x-api-token": ENV.SIA_API_TOKEN } }), ENV.SIA_FETCH_TIMEOUT || 10000);
      if (!res.ok) throw new Error(`SIA enrollments failed (${res.status}): ${await res.text()}`);
      const json = await res.json();
      if (!Array.isArray(json?.data)) throw new Error("SIA enrollments response missing data");
      return json.data;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 10000)));
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
