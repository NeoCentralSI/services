import prisma from "../../config/prisma.js";
import { RESEARCH_METHOD_RESULT } from "../../constants/research-method.js";
import { SUPERVISOR_ROLES } from "../../constants/roles.js";
import { THESIS_STATUS } from "../../constants/thesisStatus.js";
import { formatAcademicYearLabel, resolveOperationalAcademicYear } from "../../helpers/academicYear.helper.js";
import { AUDIT_ACTIONS, ENTITY_TYPES, logAudit } from "../auditLog.service.js";
import { createNotificationEventForUsers } from "../notification.service.js";
import { changeThesisStatus } from "../thesisLifecycle.service.js";

/**
 * Naik ke Penelitian: a step of its own, not part of the SIA sync. A thesis in
 * the proposal phase with a passed, final Research Method attempt moves to `research` when SIA
 * shows it takes Tugas Akhir in the running period, and that period comes after the period of
 * its Penetapan Pembimbing. Missing SIA data defers the decision. One failure does not stop the
 * others. A failed attempt keeps the thesis in the proposal phase: nothing happens here.
 */

export const PROMOTION_DECISION = Object.freeze({
  PROMOTE: "promote",
  WAIT_SIA: "wait_sia",
  WAIT_THESIS_COURSE: "wait_thesis_course",
  WAIT_NEXT_PERIOD: "wait_next_period",
});

const SEMESTER_ORDER = { ganjil: 0, genap: 1 };

/** Whether period `a` comes after period `b` (start dates when both have them, else year + semester). */
export function isLaterPeriod(a, b) {
  if (!a || !b || a.id === b.id) return false;
  if (a.startDate && b.startDate) return new Date(a.startDate) > new Date(b.startDate);
  const yearA = parseInt(String(a.year ?? "").slice(0, 4), 10);
  const yearB = parseInt(String(b.year ?? "").slice(0, 4), 10);
  if (yearA !== yearB) return yearA > yearB;
  return (SEMESTER_ORDER[a.semester] ?? 0) > (SEMESTER_ORDER[b.semester] ?? 0);
}

/** Pure decision for one candidate. */
export function decide({ operational, assignmentPeriod, snapshot }) {
  if (!isLaterPeriod(operational, assignmentPeriod)) {
    return { decision: PROMOTION_DECISION.WAIT_NEXT_PERIOD, reason: "KRS Tugas Akhir dibaca pada periode setelah periode Penetapan Pembimbing." };
  }
  if (!snapshot || typeof snapshot.takingThesisCourse !== "boolean") {
    return { decision: PROMOTION_DECISION.WAIT_SIA, reason: "Data KRS semester berjalan dari SIA belum tersedia; keputusan ditunda." };
  }
  if (!snapshot.takingThesisCourse) {
    return { decision: PROMOTION_DECISION.WAIT_THESIS_COURSE, reason: "Menurut SIA, mahasiswa belum mengambil Tugas Akhir semester ini." };
  }
  return { decision: PROMOTION_DECISION.PROMOTE, reason: "Lulus Metode Penelitian dan KRS Tugas Akhir terkonfirmasi." };
}

/**
 * Proposal-phase theses with a passed, final attempt. An attempt finalized before the thesis last
 * entered the proposal phase does not count (a thesis repeating its proposal needs a new one).
 */
async function findCandidates(client = prisma) {
  const attempts = await client.researchMethodAssessment.findMany({
    where: { isFinalized: true, result: RESEARCH_METHOD_RESULT.PASSED, thesis: { status: THESIS_STATUS.PROPOSAL, supervisorAssignedAt: { not: null } } },
    select: {
      id: true,
      finalScore: true,
      finalizedAt: true,
      academicYear: { select: { id: true, semester: true, year: true, startDate: true } },
      thesis: {
        select: {
          id: true,
          title: true,
          status: true,
          startDate: true,
          statusChangedAt: true,
          academicYear: { select: { id: true, semester: true, year: true, startDate: true } },
          student: { select: { id: true, user: { select: { fullName: true, identityNumber: true } } } },
          thesisSupervisors: { where: { status: "active", role: { name: { in: SUPERVISOR_ROLES } } }, select: { lecturerId: true } },
          supervisorAssignments: {
            select: { batch: { select: { generatedAt: true, academicYear: { select: { id: true, semester: true, year: true, startDate: true } } } } },
          },
        },
      },
    },
    orderBy: { finalizedAt: "desc" },
  });
  const byThesis = new Map();
  for (const attempt of attempts) {
    const t = attempt.thesis;
    if (t.statusChangedAt && attempt.finalizedAt && attempt.finalizedAt < t.statusChangedAt) continue;
    if (!byThesis.has(t.id)) byThesis.set(t.id, attempt);
  }
  return [...byThesis.values()];
}

function assignmentPeriodOf(thesis) {
  const batches = (thesis.supervisorAssignments ?? []).map((m) => m.batch).filter(Boolean);
  batches.sort((a, b) => new Date(a.generatedAt) - new Date(b.generatedAt));
  return batches[0]?.academicYear ?? thesis.academicYear ?? null;
}

async function evaluate(client = prisma) {
  const operational = await resolveOperationalAcademicYear(client);
  const candidates = await findCandidates(client);
  const snapshots = operational
    ? await client.studentAcademicYearSnapshot.findMany({
        where: { academicYearId: operational.id, studentId: { in: candidates.map((c) => c.thesis.student.id) } },
        select: { studentId: true, takingThesisCourse: true },
      })
    : [];
  const snapshotOf = new Map(snapshots.map((s) => [s.studentId, s]));
  return {
    operational,
    rows: candidates.map((attempt) => {
      const assignmentPeriod = assignmentPeriodOf(attempt.thesis);
      return {
        attempt,
        assignmentPeriod,
        ...(operational
          ? decide({ operational, assignmentPeriod, snapshot: snapshotOf.get(attempt.thesis.student.id) })
          : { decision: PROMOTION_DECISION.WAIT_SIA, reason: "Periode akademik berjalan belum ditetapkan." }),
      };
    }),
  };
}

function rowDto(row) {
  const { attempt, assignmentPeriod } = row;
  return {
    thesisId: attempt.thesis.id,
    title: attempt.thesis.title,
    student: { id: attempt.thesis.student.id, fullName: attempt.thesis.student.user?.fullName ?? null, identityNumber: attempt.thesis.student.user?.identityNumber ?? null },
    finalScore: attempt.finalScore,
    passedIn: attempt.academicYear ? formatAcademicYearLabel(attempt.academicYear) : null,
    assignedIn: assignmentPeriod ? formatAcademicYearLabel(assignmentPeriod) : null,
    decision: row.decision,
    reason: row.reason,
  };
}

/** What a run would do now (no writes). */
export async function previewPromotion() {
  const { operational, rows } = await evaluate();
  return { academicYear: operational ? { id: operational.id, label: formatAcademicYearLabel(operational) } : null, rows: rows.map(rowDto) };
}

/** Move every thesis whose decision is "promote"; return what happened to each candidate. */
export async function runPromotion({ actorUserId = null, now = new Date() } = {}) {
  const { operational, rows } = await evaluate();
  const promoted = [];
  const deferred = [];
  const failed = [];
  for (const row of rows) {
    if (row.decision !== PROMOTION_DECISION.PROMOTE) {
      deferred.push(rowDto(row));
      continue;
    }
    const thesis = row.attempt.thesis;
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.thesis.findUnique({ where: { id: thesis.id } });
        if (current?.status !== THESIS_STATUS.PROPOSAL) return;
        await changeThesisStatus(tx, current, THESIS_STATUS.RESEARCH, { actorUserId, now });
      });
      await logAudit({
        actorUserId,
        action: AUDIT_ACTIONS.RESEARCH_METHOD_PROMOTED,
        entityType: ENTITY_TYPES.THESIS,
        entityId: thesis.id,
        newValues: { status: THESIS_STATUS.RESEARCH, academicYearId: operational.id },
        metadata: { assessmentId: row.attempt.id, finalScore: row.attempt.finalScore, actorRole: actorUserId ? "user" : "system" },
      });
      try {
        await createNotificationEventForUsers([thesis.student.id, ...thesis.thesisSupervisors.map((s) => s.lecturerId)], {
          title: "Mulai Penelitian",
          message: `Tugas akhir "${thesis.title || "-"}" (${thesis.student.user?.fullName ?? "mahasiswa"}) masuk fase Penelitian: lulus Metode Penelitian dan KRS Tugas Akhir terkonfirmasi.`,
          type: "research_method_promoted",
          data: { thesisId: thesis.id, route: "/tugas-akhir" },
        }, { push: true });
      } catch (error) {
        console.error("[research-method:promotion] notifikasi gagal:", error?.message ?? error);
      }
      promoted.push(rowDto(row));
    } catch (error) {
      failed.push({ ...rowDto(row), error: error?.message ?? String(error) });
    }
  }
  console.log(`[research-method:promotion] naik ${promoted.length}, ditunda ${deferred.length}, gagal ${failed.length}`);
  return {
    academicYear: operational ? { id: operational.id, label: formatAcademicYearLabel(operational) } : null,
    promoted,
    deferred,
    failed,
  };
}
