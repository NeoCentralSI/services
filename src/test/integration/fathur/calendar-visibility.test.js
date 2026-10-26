/**
 * Who sees which calendar event (G1): guidance for its student and lecturer; Seminar Hasil for
 * the presenter, supervisors, examiners, Admin and its audience; Sidang without audience; the
 * yudisium event for everyone. Cancelled or not yet scheduled events are not shown, declined
 * examiners do not see the event. Runs on a real database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../../config/prisma.js";
import { getMyCalendarEvents, getUpcomingEvents } from "../../../services/calendar.service.js";

const ts = Date.now();
const DAY = "2031-03-12";
const range = { startDate: "2031-03-10T00:00:00.000Z", endDate: "2031-03-15T00:00:00.000Z" };
const created = { users: [], theses: [], seminars: [], defences: [], yudisiums: [], guidances: [] };
const people = {};
let ids = {};
let extra = {};

async function user(label, { student = false, lecturer = false, role = null } = {}) {
  const u = await prisma.user.create({
    data: { fullName: `Kal ${label} ${ts}`, identityNumber: `KAL-${label}-${ts}`, identityType: student ? "NIM" : "NIP", email: `kal-${label}-${ts}@cal.test`, password: "p" },
  });
  created.users.push(u.id);
  if (student) await prisma.student.create({ data: { id: u.id, sksCompleted: 140 } });
  if (lecturer) await prisma.lecturer.create({ data: { id: u.id } });
  if (role) {
    const r = await prisma.userRole.findFirst({ where: { name: role } });
    await prisma.userHasRole.create({ data: { userId: u.id, roleId: r.id, status: "active" } });
  }
  return u;
}

const time = (hh) => new Date(`1970-01-01T${hh}:00:00.000Z`);

beforeAll(async () => {
  people.presenter = await user("presenter", { student: true });
  people.audience = await user("audience", { student: true });
  people.outsider = await user("outsider", { student: true });
  people.p1 = await user("p1", { lecturer: true });
  people.p2 = await user("p2", { lecturer: true });
  people.examiner = await user("examiner", { lecturer: true });
  people.declined = await user("declined", { lecturer: true });
  people.otherLecturer = await user("other", { lecturer: true });
  people.admin = await user("admin", { role: "Admin" });

  const [role1, role2] = await Promise.all([
    prisma.userRole.findFirst({ where: { name: "Pembimbing 1" } }),
    prisma.userRole.findFirst({ where: { name: "Pembimbing 2" } }),
  ]);
  const thesis = await prisma.thesis.create({ data: { studentId: people.presenter.id, title: `TA Kalender ${ts}`, status: "research" } });
  created.theses.push(thesis.id);
  await prisma.thesisSupervisors.createMany({
    data: [
      { thesisId: thesis.id, lecturerId: people.p1.id, roleId: role1.id },
      { thesisId: thesis.id, lecturerId: people.p2.id, roleId: role2.id },
    ],
  });

  const seminar = await prisma.thesisSeminar.create({
    data: { thesisId: thesis.id, status: "scheduled", registeredAt: new Date(), date: new Date(`${DAY}T00:00:00.000Z`), startTime: time("09"), endTime: time("11") },
  });
  const cancelled = await prisma.thesisSeminar.create({
    data: { thesisId: thesis.id, status: "cancelled", registeredAt: new Date(), date: new Date(`${DAY}T00:00:00.000Z`), startTime: time("13"), endTime: time("14") },
  });
  const draft = await prisma.thesisSeminar.create({
    data: { thesisId: thesis.id, status: "examiner_assigned", registeredAt: new Date(), date: new Date(`${DAY}T00:00:00.000Z`), startTime: time("15"), endTime: time("16") },
  });
  created.seminars.push(seminar.id, cancelled.id, draft.id);
  await prisma.thesisSeminarExaminer.createMany({
    data: [
      { thesisSeminarId: seminar.id, lecturerId: people.examiner.id, order: 1, availabilityStatus: "available", assignedAt: new Date() },
      { thesisSeminarId: seminar.id, lecturerId: people.declined.id, order: 2, availabilityStatus: "unavailable", assignedAt: new Date() },
    ],
  });
  await prisma.thesisSeminarAudience.create({ data: { thesisSeminarId: seminar.id, thesisId: thesis.id, studentId: people.audience.id, registeredAt: new Date() } });

  const defence = await prisma.thesisDefence.create({
    data: { thesisId: thesis.id, status: "scheduled", registeredAt: new Date(), date: new Date(`${DAY}T00:00:00.000Z`), startTime: time("10"), endTime: time("12") },
  });
  created.defences.push(defence.id);
  await prisma.thesisDefenceExaminer.create({ data: { thesisDefenceId: defence.id, lecturerId: people.examiner.id, order: 1, availabilityStatus: "available", assignedAt: new Date() } });

  const guidance = await prisma.thesisGuidance.create({
    data: { thesisId: thesis.id, supervisorId: people.p1.id, phase: "research", status: "accepted", requestedDate: new Date(`${DAY}T07:00:00.000Z`), approvedDate: new Date(`${DAY}T07:00:00.000Z`) },
  });
  created.guidances.push(guidance.id);

  const yudisium = await prisma.yudisium.create({ data: { name: `Yudisium Kalender ${ts}`, eventDate: new Date(`${DAY}T02:00:00.000Z`) } });
  created.yudisiums.push(yudisium.id);

  // Going on now (WIB), and an archived seminar without a time.
  const nowWib = new Date(Date.now() + 7 * 3600 * 1000);
  const today = nowWib.toISOString().slice(0, 10);
  const hhmm = (offsetMin) => {
    const t = new Date(nowWib.getTime() + offsetMin * 60 * 1000);
    return new Date(`1970-01-01T${t.toISOString().slice(11, 16)}:00.000Z`);
  };
  // Not across midnight: start 30 minutes ago, end at most at 23:59 WIB.
  // Never before 00.00 WIB of today either.
  const startOffset = Math.min(30, nowWib.getUTCHours() * 60 + nowWib.getUTCMinutes());
  const endOffset = Math.min(60, (23 * 60 + 59) - (nowWib.getUTCHours() * 60 + nowWib.getUTCMinutes()));
  const ongoingSeminar = await prisma.thesisSeminar.create({
    data: { thesisId: thesis.id, status: "scheduled", registeredAt: new Date(), date: new Date(`${today}T00:00:00.000Z`), startTime: hhmm(-startOffset), endTime: hhmm(Math.max(endOffset, 1)) },
  });
  const ongoingDefence = await prisma.thesisDefence.create({
    data: { thesisId: thesis.id, status: "scheduled", registeredAt: new Date(), date: new Date(`${today}T00:00:00.000Z`), startTime: hhmm(-startOffset), endTime: hhmm(Math.max(endOffset, 1)) },
  });
  const archived = await prisma.thesisSeminar.create({
    data: { thesisId: thesis.id, status: "failed", registeredAt: new Date(), date: new Date("2031-03-11T00:00:00.000Z") },
  });
  created.seminars.push(ongoingSeminar.id, archived.id);
  created.defences.push(ongoingDefence.id);
  await prisma.thesisSeminarExaminer.create({ data: { thesisSeminarId: ongoingSeminar.id, lecturerId: people.examiner.id, order: 1, availabilityStatus: "available", assignedAt: new Date() } });
  await prisma.thesisDefenceExaminer.create({ data: { thesisDefenceId: ongoingDefence.id, lecturerId: people.examiner.id, order: 1, availabilityStatus: "available", assignedAt: new Date() } });
  await prisma.thesisSeminarAudience.create({ data: { thesisSeminarId: ongoingSeminar.id, thesisId: thesis.id, studentId: people.audience.id, registeredAt: new Date() } });
  await prisma.thesisSeminarAudience.create({ data: { thesisSeminarId: archived.id, thesisId: thesis.id, studentId: people.audience.id, registeredAt: new Date() } });
  extra = { ongoingSeminar: `seminar-${ongoingSeminar.id}`, ongoingDefence: `defence-${ongoingDefence.id}`, archived: `seminar-${archived.id}` };

  ids = { seminar: `seminar-${seminar.id}`, cancelled: `seminar-${cancelled.id}`, draft: `seminar-${draft.id}`, defence: `defence-${defence.id}`, guidance: `guidance-${guidance.id}`, yudisium: `yudisium-${yudisium.id}` };
});

afterAll(async () => {
  await prisma.thesisGuidance.deleteMany({ where: { id: { in: created.guidances } } });
  await prisma.thesisSeminarAudience.deleteMany({ where: { thesisSeminarId: { in: created.seminars } } });
  await prisma.thesisSeminarExaminer.deleteMany({ where: { thesisSeminarId: { in: created.seminars } } });
  await prisma.thesisSeminar.deleteMany({ where: { id: { in: created.seminars } } });
  await prisma.thesisDefenceExaminer.deleteMany({ where: { thesisDefenceId: { in: created.defences } } });
  await prisma.thesisDefence.deleteMany({ where: { id: { in: created.defences } } });
  await prisma.thesisSupervisors.deleteMany({ where: { thesisId: { in: created.theses } } });
  await prisma.thesis.deleteMany({ where: { id: { in: created.theses } } });
  await prisma.yudisium.deleteMany({ where: { id: { in: created.yudisiums } } });
  await prisma.userHasRole.deleteMany({ where: { userId: { in: created.users } } });
  await prisma.student.deleteMany({ where: { id: { in: created.users } } });
  await prisma.lecturer.deleteMany({ where: { id: { in: created.users } } });
  await prisma.user.deleteMany({ where: { id: { in: created.users } } });
});

/** The ids of our test events the person sees. */
async function seen(person) {
  const { events } = await getMyCalendarEvents(person.id, null, range);
  const ours = new Set(Object.values(ids));
  return events.filter((e) => ours.has(e.id)).map((e) => e.id).sort();
}

describe("calendar: who sees what", () => {
  it("presenting student: own guidance, seminar, defence and the yudisium event", async () => {
    expect(await seen(people.presenter)).toEqual([ids.defence, ids.guidance, ids.seminar, ids.yudisium].sort());
  });

  it("Pembimbing 1 sees the session; Pembimbing 2 only the seminar and defence", async () => {
    expect(await seen(people.p1)).toEqual([ids.defence, ids.guidance, ids.seminar, ids.yudisium].sort());
    expect(await seen(people.p2)).toEqual([ids.defence, ids.seminar, ids.yudisium].sort());
  });

  it("an examiner sees the seminar and defence; a declined examiner does not", async () => {
    expect(await seen(people.examiner)).toEqual([ids.defence, ids.seminar, ids.yudisium].sort());
    expect(await seen(people.declined)).toEqual([ids.yudisium]);
  });

  it("the audience sees the seminar, not the defence", async () => {
    expect(await seen(people.audience)).toEqual([ids.seminar, ids.yudisium].sort());
  });

  it("Admin sees seminars and defences; others only the yudisium event", async () => {
    expect(await seen(people.admin)).toEqual([ids.defence, ids.seminar, ids.yudisium].sort());
    expect(await seen(people.outsider)).toEqual([ids.yudisium]);
    expect(await seen(people.otherLecturer)).toEqual([ids.yudisium]);
  });

  it("cancelled or not yet scheduled seminars leave no event", async () => {
    const all = await seen(people.admin);
    expect(all).not.toContain(ids.cancelled);
    expect(all).not.toContain(ids.draft);
  });

  it("the seminar event has its time, room fallback, status and people", async () => {
    const { events } = await getMyCalendarEvents(people.admin.id, null, range);
    const event = events.find((e) => e.id === ids.seminar);
    expect(event).toMatchObject({
      kind: "seminar",
      kindLabel: "Seminar Hasil",
      title: `Seminar Hasil – Kal presenter ${ts}`,
      statusLabel: "Terjadwal",
      description: `TA Kalender ${ts}`,
      startDate: `${DAY}T02:00:00.000Z`,
      endDate: `${DAY}T04:00:00.000Z`,
      location: "TBA",
      detailPath: `/tugas-akhir/seminar-hasil/${ids.seminar.replace("seminar-", "")}`,
    });
    expect(event.participants.map((p) => p.roleLabel)).toEqual(["Mahasiswa", "Pembimbing 1", "Pembimbing 2", "Penguji 1"]);
  });

  it("Lihat Detail opens the page of the viewer's role", async () => {
    const lecturer = (await getMyCalendarEvents(people.p1.id, null, range)).events;
    const student = (await getMyCalendarEvents(people.presenter.id, null, range)).events;
    expect(lecturer.find((e) => e.id === ids.guidance).detailPath).toMatch(/^\/tugas-akhir\/bimbingan\/lecturer\/session\//);
    expect(student.find((e) => e.id === ids.guidance).detailPath).toMatch(/^\/tugas-akhir\/bimbingan\/student\/session\//);
    expect(student.find((e) => e.id === ids.yudisium).detailPath).toBe("/yudisium");
    expect(lecturer.find((e) => e.id === ids.yudisium).detailPath).toBe(`/yudisium/${ids.yudisium.replace("yudisium-", "")}`);
  });

  it("Agenda Mendatang uses the same source", async () => {
    const { events } = await getUpcomingEvents(people.presenter.id, null, 3650, 20);
    const agenda = events.map((e) => e.id);
    expect(agenda).toEqual(expect.arrayContaining([ids.seminar, ids.defence, ids.guidance, ids.yudisium]));
  });
});

describe("Agenda Mendatang and event times", () => {
  const agendaOf = async (person) => (await getUpcomingEvents(person.id, null, 3650, 20)).events.map((e) => e.id);

  it("shows the seminar and defence going on now for every role that may see them", async () => {
    for (const person of [people.presenter, people.p1, people.p2, people.examiner, people.admin]) {
      const agenda = await agendaOf(person);
      expect(agenda, person.fullName).toEqual(expect.arrayContaining([extra.ongoingSeminar, extra.ongoingDefence]));
    }
    const audience = await agendaOf(people.audience);
    expect(audience).toContain(extra.ongoingSeminar);
    expect(audience).not.toContain(extra.ongoingDefence);
    expect(await agendaOf(people.outsider)).not.toContain(extra.ongoingSeminar);
  });

  it("puts what is going on first, then the coming events by time, at most five", async () => {
    const { events } = await getUpcomingEvents(people.presenter.id, null, 3650, 5);
    expect(events.length).toBeLessThanOrEqual(5);
    expect([extra.ongoingSeminar, extra.ongoingDefence]).toContain(events[0].id);
  });

  it("a seminar without a time is an all-day event on its date, not 00.00", async () => {
    const { events } = await getMyCalendarEvents(people.audience.id, null, range);
    const event = events.find((e) => e.id === extra.archived);
    expect(event).toMatchObject({ allDay: true, startDate: "2031-03-11", endDate: null });
  });
});
