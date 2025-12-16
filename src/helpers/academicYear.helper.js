import prisma from "../config/prisma.js";

/**
 * Get current date/time in WIB (Asia/Jakarta) timezone
 * Padang, Sumatera Barat uses WIB (UTC+7)
 * @returns {Date} Current date in WIB
 */
export function getCurrentDateWIB() {
  // Get current UTC time and convert to WIB
  const now = new Date();
  return now; // JavaScript Date objects are timezone-aware, comparison works correctly
}

/**
 * Check if an academic year is currently active based on date range
 * @param {Object} academicYear - The academic year object with startDate and endDate
 * @returns {boolean} True if current date is within the academic year's range
 */
export function isWithinDateRange(academicYear) {
  if (!academicYear?.startDate || !academicYear?.endDate) return false;
  
  const now = getCurrentDateWIB();
  const start = new Date(academicYear.startDate);
  const end = new Date(academicYear.endDate);
  
  // Set end date to end of day (23:59:59.999) for inclusive comparison
  end.setHours(23, 59, 59, 999);
  
  return now >= start && now <= end;
}

/**
 * Get the currently active academic year based on current date
 * An academic year is active if: startDate <= now <= endDate
 * @returns {Promise<Object|null>} The active academic year or null
 */
export async function getActiveAcademicYear() {
  const now = getCurrentDateWIB();
  
  // Find academic year where current date is within the range
  const active = await prisma.academicYear.findFirst({
    where: {
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: [
      { year: "desc" },
      { startDate: "desc" },
    ],
  });
  
  return active;
}

/**
 * Get all academic years with computed isActive status
 * @returns {Promise<Array>} Academic years with isActive computed
 */
export async function getAcademicYearsWithStatus() {
  const academicYears = await prisma.academicYear.findMany({
    orderBy: [
      { year: "desc" },
      { semester: "desc" },
    ],
  });
  
  return academicYears.map(ay => ({
    ...ay,
    isActive: isWithinDateRange(ay),
  }));
}

/**
 * Get the active academic year ID, or null if none is active
 * @returns {Promise<string|null>} The active academic year ID
 */
export async function getActiveAcademicYearId() {
  const active = await getActiveAcademicYear();
  return active?.id || null;
}

/**
 * Check if a given academic year is the active one
 * @param {string} id - The ID to check
 * @returns {Promise<boolean>} True if the given ID is the active academic year
 */
export async function isActiveAcademicYear(id) {
  if (!id) return false;
  const active = await getActiveAcademicYear();
  return active?.id === id;
}

/**
 * Get academic year label (e.g., "Ganjil 2025")
 * @param {Object} academicYear - The academic year object
 * @returns {string} Formatted label
 */
export function formatAcademicYearLabel(academicYear) {
  if (!academicYear) return "-";
  const semester = academicYear.semester === "ganjil" ? "Ganjil" : "Genap";
  return `${semester} ${academicYear.year || ""}`.trim();
}
