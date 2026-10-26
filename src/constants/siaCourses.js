/**
 * Course codes NeoCentral reads in a student's current courses (KRS) from SIA to set the semester
 * flags "Mengambil Metode Penelitian" and "Mengambil Tugas Akhir" (K45). SIA sends what it has
 * (code, name, credits); NeoCentral decides. When a code is unknown the course name is the
 * fallback. Change the codes here when the curriculum changes.
 */
// IF4001 and IF5001 are placeholder codes: replace them with the real curriculum codes.
export const RESEARCH_METHOD_COURSE_CODES = Object.freeze(["IF4001"]);
export const THESIS_COURSE_CODES = Object.freeze(["IF5001"]);

/** Fallback on the course name, for codes not listed above. */
export const RESEARCH_METHOD_COURSE_NAME = /metod(e|ologi)\s+penelitian/i;
export const THESIS_COURSE_NAME = /tugas\s+akhir|skripsi/i;
