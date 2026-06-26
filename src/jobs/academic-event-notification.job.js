import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";
import { createNotificationsForUsers } from "../services/notification.service.js";
import { sendFcmToUsers } from "../services/push.service.js";

const TIME_ZONE = "Asia/Jakarta";
const DAY_MS = 24 * 60 * 60 * 1000;

const formatDateKey = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const formatDateLong = (date) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));

const formatDateTimeLong = (date) =>
  new Intl.DateTimeFormat("id-ID", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));

const formatTimeOnly = (time) => {
  if (!time) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
};

const targetDateKey = (now, offsetDays = 0) =>
  formatDateKey(new Date(now.getTime() + offsetDays * DAY_MS));

const broadDateRange = (now, offsetDays = 0) => {
  const target = new Date(now.getTime() + offsetDays * DAY_MS);
  return {
    start: new Date(target.getTime() - 2 * DAY_MS),
    end: new Date(target.getTime() + 2 * DAY_MS),
  };
};

const unique = (values) => [...new Set((values || []).filter(Boolean))];

const notifyUsers = async (userIds, { title, message, data = {} }) => {
  const recipients = unique(userIds);
  if (recipients.length === 0) return 0;

  await createNotificationsForUsers(recipients, { title, message });
  await sendFcmToUsers(recipients, {
    title,
    body: message,
    data,
    dataOnly: true,
  });

  return recipients.length;
};

const getUsersByRole = async (roleName) => {
  const users = await prisma.user.findMany({
    where: {
      userHasRoles: {
        some: {
          status: "active",
          role: { name: roleName },
        },
      },
    },
    select: { id: true },
  });
  return users.map((user) => user.id);
};

const getAllStudentUserIds = async () => {
  const students = await prisma.student.findMany({
    select: { id: true },
  });
  return students.map((student) => student.id);
};

const getUserIdsFromLecturerIds = async (lecturerIds) => {
  const users = await prisma.user.findMany({
    where: { id: { in: unique(lecturerIds) } },
    select: { id: true },
  });
  return users.map((user) => user.id);
};

const buildSeminarRecipients = async (seminar) => {
  const studentIds = [
    seminar.thesis?.studentId,
    ...(seminar.audiences || []).map((audience) => audience.studentId),
  ];
  const lecturerUserIds = await getUserIdsFromLecturerIds(
    (seminar.examiners || []).map((examiner) => examiner.lecturerId)
  );
  return unique([...studentIds, ...lecturerUserIds]);
};

const buildDefenceRecipients = async (defence) => {
  const lecturerIds = [
    ...(defence.examiners || []).map((examiner) => examiner.lecturerId),
    ...(defence.thesis?.thesisSupervisors || []).map((supervisor) => supervisor.lecturerId),
  ];
  const lecturerUserIds = await getUserIdsFromLecturerIds(lecturerIds);
  return unique([defence.thesis?.studentId, ...lecturerUserIds]);
};

const getEventDateText = (date, startTime = null) => {
  const timeText = formatTimeOnly(startTime);
  return `${formatDateLong(date)}${timeText ? ` pukul ${timeText} WIB` : ""}`;
};

export const runAcademicEventReminderJob = async ({ offsetDays, phase, now = new Date() }) => {
  const started = new Date();
  const targetKey = targetDateKey(now, offsetDays);
  const range = broadDateRange(now, offsetDays);
  const isTomorrow = offsetDays === 1;
  const titlePrefix = isTomorrow ? "Pengingat Event Besok" : "Pengingat Event Hari Ini";
  const intro = isTomorrow ? "Besok" : "Hari ini";

  console.log(`🔔 [academic-event-${phase}] Job started for target=${targetKey}`);

  const [seminarsRaw, defencesRaw, yudisiumsRaw] = await Promise.all([
    prisma.thesisSeminar.findMany({
      where: {
        status: "scheduled",
        date: { gte: range.start, lte: range.end },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        meetingLink: true,
        room: { select: { name: true } },
        thesis: { select: { studentId: true, title: true, student: { select: { user: { select: { fullName: true } } } } } },
        audiences: {
          where: { approvedAt: { not: null } },
          select: { studentId: true },
        },
        examiners: {
          where: { availabilityStatus: "available" },
          select: { lecturerId: true },
        },
      },
    }),
    prisma.thesisDefence.findMany({
      where: {
        status: "scheduled",
        date: { gte: range.start, lte: range.end },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        meetingLink: true,
        room: { select: { name: true } },
        thesis: {
          select: {
            studentId: true,
            title: true,
            student: { select: { user: { select: { fullName: true } } } },
            thesisSupervisors: { select: { lecturerId: true } },
          },
        },
        examiners: {
          where: { availabilityStatus: "available" },
          select: { lecturerId: true },
        },
      },
    }),
    prisma.yudisium.findMany({
      where: {
        eventDate: { gte: range.start, lte: range.end },
        participants: { some: { status: "appointed" } },
      },
      select: {
        id: true,
        name: true,
        eventDate: true,
        room: { select: { name: true } },
        participants: {
          where: { status: "appointed" },
          select: { thesis: { select: { studentId: true } } },
        },
      },
    }),
  ]);

  const seminars = seminarsRaw.filter((item) => formatDateKey(item.date) === targetKey);
  const defences = defencesRaw.filter((item) => formatDateKey(item.date) === targetKey);
  const yudisiums = yudisiumsRaw.filter((item) => formatDateKey(item.eventDate) === targetKey);

  let sent = 0;

  for (const seminar of seminars) {
    const recipients = await buildSeminarRecipients(seminar);
    const studentName = seminar.thesis?.student?.user?.fullName || "mahasiswa";
    const location = seminar.room?.name || seminar.meetingLink || "lokasi yang telah ditentukan";
    sent += await notifyUsers(recipients, {
      title: `${titlePrefix}: Seminar Hasil`,
      message: `${intro} ada Seminar Hasil ${studentName} pada ${getEventDateText(seminar.date, seminar.startTime)} di ${location}.`,
      data: {
        type: `thesis_seminar_${phase}_reminder`,
        seminarId: seminar.id,
        route: "/dashboard",
      },
    });
  }

  for (const defence of defences) {
    const recipients = await buildDefenceRecipients(defence);
    const studentName = defence.thesis?.student?.user?.fullName || "mahasiswa";
    const location = defence.room?.name || defence.meetingLink || "lokasi yang telah ditentukan";
    sent += await notifyUsers(recipients, {
      title: `${titlePrefix}: Sidang Tugas Akhir`,
      message: `${intro} ada Sidang Tugas Akhir ${studentName} pada ${getEventDateText(defence.date, defence.startTime)} di ${location}.`,
      data: {
        type: `thesis_defence_${phase}_reminder`,
        defenceId: defence.id,
        route: "/dashboard",
      },
    });
  }

  for (const yudisium of yudisiums) {
    const recipients = unique(yudisium.participants.map((participant) => participant.thesis?.studentId));
    const location = yudisium.room?.name || "lokasi yang telah ditentukan";
    sent += await notifyUsers(recipients, {
      title: `${titlePrefix}: Yudisium`,
      message: `${intro} ada pelaksanaan ${yudisium.name} pada ${formatDateTimeLong(yudisium.eventDate)} WIB di ${location}.`,
      data: {
        type: `yudisium_${phase}_reminder`,
        yudisiumId: yudisium.id,
        route: "/yudisium",
      },
    });
  }

  const finished = new Date();
  console.log(
    `✅ [academic-event-${phase}] Job finished — seminar=${seminars.length}, defence=${defences.length}, yudisium=${yudisiums.length}, recipients=${sent}, duration=${finished.getTime() - started.getTime()}ms`
  );

  return {
    seminar: seminars.length,
    defence: defences.length,
    yudisium: yudisiums.length,
    sent,
  };
};

export const runYudisiumRegistrationClosingReminderJob = async (now = new Date()) => {
  const targetKey = targetDateKey(now, 1);
  const range = broadDateRange(now, 1);
  console.log(`📣 [yudisium-registration-closing-h-1] Job started for target=${targetKey}`);

  const yudisiumsRaw = await prisma.yudisium.findMany({
    where: {
      registrationCloseDate: { gte: range.start, lte: range.end },
      registrationOpenDate: { not: null },
    },
    select: { id: true, name: true, registrationCloseDate: true },
  });
  const yudisiums = yudisiumsRaw.filter((item) => formatDateKey(item.registrationCloseDate) === targetKey);
  const studentIds = yudisiums.length > 0 ? await getAllStudentUserIds() : [];

  let sent = 0;
  for (const yudisium of yudisiums) {
    sent += await notifyUsers(studentIds, {
      title: "Pendaftaran Yudisium Segera Ditutup",
      message: `Pendaftaran ${yudisium.name} akan ditutup besok, ${formatDateTimeLong(yudisium.registrationCloseDate)} WIB. Segera lengkapi persyaratan yudisium Anda.`,
      data: {
        type: "yudisium_registration_closing_h_1",
        yudisiumId: yudisium.id,
        route: "/yudisium",
      },
    });
  }

  console.log(`✅ [yudisium-registration-closing-h-1] Job finished — yudisium=${yudisiums.length}, recipients=${sent}`);
  return { yudisium: yudisiums.length, sent };
};

export const runYudisiumRegistrationOpenReminderJob = async (now = new Date()) => {
  const targetKey = targetDateKey(now, 0);
  const range = broadDateRange(now, 0);
  console.log(`📣 [yudisium-registration-open] Job started for target=${targetKey}`);

  const yudisiumsRaw = await prisma.yudisium.findMany({
    where: {
      registrationOpenDate: { gte: range.start, lte: range.end },
      registrationCloseDate: { not: null },
    },
    select: { id: true, name: true, registrationOpenDate: true, registrationCloseDate: true },
  });
  const yudisiums = yudisiumsRaw.filter((item) => formatDateKey(item.registrationOpenDate) === targetKey);
  const studentIds = yudisiums.length > 0 ? await getAllStudentUserIds() : [];

  let sent = 0;
  for (const yudisium of yudisiums) {
    sent += await notifyUsers(studentIds, {
      title: "Pendaftaran Yudisium Dibuka",
      message: `${yudisium.name} telah dibuka. Pendaftaran tersedia sampai ${formatDateTimeLong(yudisium.registrationCloseDate)} WIB.`,
      data: {
        type: "yudisium_registration_open",
        yudisiumId: yudisium.id,
        route: "/yudisium",
      },
    });
  }

  console.log(`✅ [yudisium-registration-open] Job finished — yudisium=${yudisiums.length}, recipients=${sent}`);
  return { yudisium: yudisiums.length, sent };
};

export const runYudisiumRegistrationClosedReminderJob = async (now = new Date()) => {
  const targetKey = targetDateKey(now, 0);
  const range = broadDateRange(now, 0);
  console.log(`📣 [yudisium-registration-closed] Job started for target=${targetKey}`);

  const yudisiumsRaw = await prisma.yudisium.findMany({
    where: {
      registrationCloseDate: { gte: range.start, lte: range.end },
      registrationOpenDate: { not: null },
    },
    select: { id: true, name: true, registrationCloseDate: true },
  });
  const yudisiums = yudisiumsRaw.filter((item) => formatDateKey(item.registrationCloseDate) === targetKey);
  const coordinatorIds = yudisiums.length > 0 ? await getUsersByRole(ROLES.KOORDINATOR_YUDISIUM) : [];

  let sent = 0;
  for (const yudisium of yudisiums) {
    sent += await notifyUsers(coordinatorIds, {
      title: "Pendaftaran Yudisium Ditutup",
      message: `Pendaftaran ${yudisium.name} telah ditutup. Koordinator Yudisium sudah dapat melakukan finalisasi peserta.`,
      data: {
        type: "yudisium_registration_closed",
        yudisiumId: yudisium.id,
        route: `/yudisium/${yudisium.id}`,
      },
    });
  }

  console.log(`✅ [yudisium-registration-closed] Job finished — yudisium=${yudisiums.length}, recipients=${sent}`);
  return { yudisium: yudisiums.length, sent };
};

export const runExaminerNoResponseReminderJob = async (now = new Date()) => {
  const targetKey = targetDateKey(now, -3);
  const range = broadDateRange(now, -3);
  console.log(`📣 [examiner-no-response] Job started for assignedAt target=${targetKey}`);

  const [seminarExaminersRaw, defenceExaminersRaw, kadepIds] = await Promise.all([
    prisma.thesisSeminarExaminer.findMany({
      where: {
        availabilityStatus: "pending",
        respondedAt: null,
        assignedAt: { gte: range.start, lte: range.end },
      },
      select: {
        id: true,
        assignedAt: true,
        lecturerId: true,
        seminar: {
          select: {
            id: true,
            thesis: { select: { title: true, student: { select: { user: { select: { fullName: true } } } } } },
          },
        },
      },
    }),
    prisma.thesisDefenceExaminer.findMany({
      where: {
        availabilityStatus: "pending",
        respondedAt: null,
        assignedAt: { gte: range.start, lte: range.end },
      },
      select: {
        id: true,
        assignedAt: true,
        lecturerId: true,
        defence: {
          select: {
            id: true,
            thesis: { select: { title: true, student: { select: { user: { select: { fullName: true } } } } } },
          },
        },
      },
    }),
    getUsersByRole(ROLES.KETUA_DEPARTEMEN),
  ]);

  const seminarExaminers = seminarExaminersRaw.filter((item) => formatDateKey(item.assignedAt) === targetKey);
  const defenceExaminers = defenceExaminersRaw.filter((item) => formatDateKey(item.assignedAt) === targetKey);

  const lecturerIds = unique([
    ...seminarExaminers.map((item) => item.lecturerId),
    ...defenceExaminers.map((item) => item.lecturerId),
  ]);
  const lecturerUsers = lecturerIds.length
    ? await prisma.user.findMany({
        where: { id: { in: lecturerIds } },
        select: { id: true, fullName: true },
      })
    : [];
  const lecturerNameById = new Map(lecturerUsers.map((user) => [user.id, user.fullName]));

  let sent = 0;
  for (const examiner of seminarExaminers) {
    const lecturerName = lecturerNameById.get(examiner.lecturerId) || "Dosen penguji";
    const studentName = examiner.seminar?.thesis?.student?.user?.fullName || "mahasiswa";
    sent += await notifyUsers(kadepIds, {
      title: "Penguji Seminar Belum Merespons",
      message: `${lecturerName} belum merespons penugasan sebagai penguji Seminar Hasil ${studentName} setelah 3 hari.`,
      data: {
        type: "seminar_examiner_no_response",
        seminarId: examiner.seminar?.id,
        examinerId: examiner.id,
        route: examiner.seminar?.id ? `/tugas-akhir/seminar-hasil/${examiner.seminar.id}` : "/dashboard",
      },
    });
  }

  for (const examiner of defenceExaminers) {
    const lecturerName = lecturerNameById.get(examiner.lecturerId) || "Dosen penguji";
    const studentName = examiner.defence?.thesis?.student?.user?.fullName || "mahasiswa";
    sent += await notifyUsers(kadepIds, {
      title: "Penguji Sidang Belum Merespons",
      message: `${lecturerName} belum merespons penugasan sebagai penguji Sidang Tugas Akhir ${studentName} setelah 3 hari.`,
      data: {
        type: "defence_examiner_no_response",
        defenceId: examiner.defence?.id,
        examinerId: examiner.id,
        route: examiner.defence?.id ? `/tugas-akhir/sidang/${examiner.defence.id}` : "/dashboard",
      },
    });
  }

  console.log(
    `✅ [examiner-no-response] Job finished — seminar=${seminarExaminers.length}, defence=${defenceExaminers.length}, recipients=${sent}`
  );
  return { seminar: seminarExaminers.length, defence: defenceExaminers.length, sent };
};
