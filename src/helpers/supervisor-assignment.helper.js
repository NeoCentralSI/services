import crypto from "crypto";
import { ROLES } from "../constants/roles.js";
import { UNTITLED_THESIS } from "../constants/thesis-proposal.js";
import { generateSupervisorAssignmentPdf } from "../utils/supervisor-assignment.pdf.js";

/**
 * Penetapan Pembimbing (formulir TA-04): who is in a period's batch and what its PDF says.
 * Shared by the assignment service and the seeder so a seeded batch is "current" exactly
 * when the service would say so.
 */

const ROLE_ORDER = { [ROLES.PEMBIMBING_1]: 0, [ROLES.PEMBIMBING_2]: 1 };

/** "Pembimbing 1, Pembimbing 2" names of the active supervisor relations. */
export function formatSupervisorNames(supervisors = []) {
  const names = supervisors
    .filter((s) => (s.status == null || s.status === "active") && s.role?.name in ROLE_ORDER)
    .slice()
    .sort((a, b) => ROLE_ORDER[a.role.name] - ROLE_ORDER[b.role.name])
    .map((s) => String(s.lecturer?.user?.fullName ?? "").trim())
    .filter(Boolean);
  return [...new Set(names)].join(", ");
}

/**
 * Rows of a batch and the hash that tells whether a stored batch still matches them
 * (rule kept from the old module: thesis, student name, NIM, title, supervisor names).
 * @param {Array} theses - theses with `student.user` and active `thesisSupervisors` (role, lecturer.user)
 */
export function buildAssignmentCohort(theses = []) {
  const entries = theses
    .map((thesis) => ({
      thesisId: thesis.id,
      studentName: thesis.student?.user?.fullName ?? "-",
      studentNim: thesis.student?.user?.identityNumber ?? "-",
      title: String(thesis.title ?? "").trim() || UNTITLED_THESIS,
      supervisorNames: formatSupervisorNames(thesis.thesisSupervisors) || "-",
    }))
    .sort((a, b) => a.studentNim.localeCompare(b.studentNim) || a.thesisId.localeCompare(b.thesisId));
  const hashPayload = entries.slice().sort((a, b) => a.thesisId.localeCompare(b.thesisId));
  return {
    entries,
    cohortHash: crypto.createHash("sha256").update(JSON.stringify(hashPayload)).digest("hex"),
  };
}

export function semesterLabel(academicYear) {
  if (!academicYear) return "-";
  return `${academicYear.semester === "genap" ? "Genap" : "Ganjil"} ${academicYear.year ?? ""}`.trim();
}

/** File name of a batch PDF; the form code stays in the document only. */
export function assignmentPdfFileName(academicYear, version) {
  const safeYear = String(academicYear?.year ?? "-").replace(/[\/\\?%*:|"<>]/g, "-");
  const semester = academicYear?.semester === "genap" ? "Genap" : "Ganjil";
  return `Penetapan-Pembimbing-${safeYear}-${semester}-v${version}.pdf`;
}

/** The PDF of a batch, titled "Formulir TA-04" (the form code only in the PDF). */
export async function renderAssignmentPdf({ academicYear, entries, kadep, preview = false, now = new Date(), verification = null }) {
  return generateSupervisorAssignmentPdf({
    preview,
    verification,
    semester: semesterLabel(academicYear),
    entries: entries.map((entry) => ({
      studentName: entry.studentName,
      nim: entry.studentNim,
      title: entry.title,
      supervisorName: entry.supervisorNames,
    })),
    dateGenerated: now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" }),
    kadepName: kadep?.fullName ?? "(...............................)",
    kadepNip: kadep?.identityNumber ?? "(...............................)",
  });
}
