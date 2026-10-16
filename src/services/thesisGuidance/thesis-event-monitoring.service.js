/**
 * Seminar Hasil and Sidang tabs of the monitoring page (Paket E3): summary cards, "Siap
 * Mendaftar", "Jadwal Mendatang", "Perlu Perhatian" and the table, for one semester.
 * Read-only.
 */
import * as monitoringRepository from "../../repositories/thesisGuidance/monitoring.repository.js";
import * as eventRepository from "../../repositories/thesisGuidance/thesis-event-monitoring.repository.js";
import { EVENT_KIND, EVENT_STATUS_PRIORITY, UPCOMING_LIMIT } from "../../constants/thesis-event-monitoring.js";
import { getEventReferenceDate } from "../../helpers/semester-scope.helper.js";
import {
  compareBySchedule,
  getAverageFinalScore,
  isUpcomingEvent,
  resolveEventAttention,
  summarizeEvents,
} from "../../helpers/thesis-event-monitoring.helper.js";

/** One seminar or defence as every block of the tab shows it. */
function formatEvent(kind, event) {
  return {
    id: event.id,
    thesisId: event.thesisId,
    title: event.thesis?.title ?? null,
    student: {
      name: event.thesis?.student?.user?.fullName ?? null,
      nim: event.thesis?.student?.user?.identityNumber ?? null,
    },
    status: event.status,
    date: event.date ?? null,
    startTime: event.startTime ?? null,
    endTime: event.endTime ?? null,
    room: event.room?.name ?? null,
    // Examiners that are still assigned, as on the monitoring detail.
    examiners: (event.examiners ?? [])
      .filter((examiner) => examiner.availabilityStatus !== "unavailable")
      .map((examiner) => ({ order: examiner.order ?? null, name: examiner.lecturer?.user?.fullName ?? null })),
    finalScore: event.finalScore ?? null,
    ...(kind === EVENT_KIND.DEFENCE ? { grade: event.grade ?? null } : {}),
    registeredAt: event.registeredAt ?? null,
    resultFinalizedAt: event.resultFinalizedAt ?? null,
    revisionFinalizedAt: event.revisionFinalizedAt ?? null,
  };
}

function formatReadyThesis(thesis) {
  return {
    thesisId: thesis.id,
    title: thesis.title ?? null,
    student: {
      name: thesis.student?.user?.fullName ?? null,
      nim: thesis.student?.user?.identityNumber ?? null,
    },
    supervisors: (thesis.thesisSupervisors ?? []).map((supervisor) => ({
      name: supervisor.lecturer?.user?.fullName ?? null,
      role: supervisor.role?.name ?? null,
    })),
  };
}

/** Latest first, by the date that places the event in its semester (held, else registered). */
function byLatestReferenceDate(a, b) {
  const time = (event) => new Date(getEventReferenceDate(event) ?? 0).getTime();
  return time(b) - time(a);
}

/**
 * Paket E5: the table order of the seminar and defence modules (status priority), the latest
 * first inside the same priority.
 */
export function byStatusPriorityThenLatest(kind) {
  const priority = EVENT_STATUS_PRIORITY[kind];
  return (a, b) => (priority[a.status] ?? 99) - (priority[b.status] ?? 99) || byLatestReferenceDate(a, b);
}

async function getEventMonitoring(kind, academicYearId, now = new Date()) {
  const semester = await monitoringRepository.findSemester(academicYearId);
  const [events, readyTheses] = await Promise.all([
    eventRepository.findEvents(kind, semester),
    eventRepository.findThesesReadyToRegister(kind, semester),
  ]);

  const upcoming = events.filter((event) => isUpcomingEvent(event, now)).sort(compareBySchedule);
  const attention = events
    .map((event) => ({ event, attention: resolveEventAttention(event, now) }))
    .filter((row) => row.attention)
    // Longest wait first.
    .sort((a, b) => b.attention.days - a.attention.days);

  return {
    kind,
    summary: {
      ...summarizeEvents(events),
      ...(kind === EVENT_KIND.DEFENCE ? { averageFinalScore: getAverageFinalScore(events) } : {}),
    },
    readyToRegister: readyTheses.map(formatReadyThesis),
    upcoming: upcoming.slice(0, UPCOMING_LIMIT).map((event) => formatEvent(kind, event)),
    upcomingTotal: upcoming.length,
    attention: attention.map((row) => ({ ...formatEvent(kind, row.event), attention: row.attention })),
    items: [...events].sort(byStatusPriorityThenLatest(kind)).map((event) => formatEvent(kind, event)),
  };
}

export const getSeminarMonitoring = (academicYearId, now) => getEventMonitoring(EVENT_KIND.SEMINAR, academicYearId, now);
export const getDefenceMonitoring = (academicYearId, now) => getEventMonitoring(EVENT_KIND.DEFENCE, academicYearId, now);
