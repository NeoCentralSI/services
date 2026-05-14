import { PrismaClient } from "../generated/prisma/index.js";
import { ROLE_CATEGORY } from "../constants/roles.js";

const prisma = new PrismaClient();

/**
 * Get calendar events for a user based on their role
 * Events are generated from existing data (guidances, seminars, defences)
 */
export async function getMyCalendarEvents(userId, userRole, filters = {}) {
  const { startDate, endDate, types, status } = filters;

  console.log('[Calendar Service] ===== GET MY CALENDAR EVENTS =====');
  console.log('[Calendar Service] User ID:', userId);
  console.log('[Calendar Service] User Role:', userRole);
  console.log('[Calendar Service] Filters:', filters);

  try {
    // Get user details to find student/lecturer ID
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: true,
        lecturer: true,
      },
    });

    if (!user) {
      throw new Error("User not found");
    }

    console.log('[Calendar Service] User found:', {
      id: user.id,
      fullName: user.fullName,
      hasStudent: !!user.student,
      haslecturer: !!user.lecturer,
      studentId: user.student?.id,
      lecturerId: user.lecturer?.id
    });

    const events = [];

    // Get guidance events
    if (userRole === ROLE_CATEGORY.STUDENT && user.student) {
      const guidances = await prisma.thesisGuidance.findMany({
        where: {
          thesis: {
            studentId: user.student.id,
          },
          // Only show accepted guidances in calendar (not requested or rejected)
          status: status || "accepted",
          ...(startDate &&
            endDate && {
            requestedDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        },
        include: {
          supervisor: {
            include: {
              user: true,
            },
          },
          thesis: {
            include: {
              student: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      guidances.forEach((guidance) => {
        if (guidance.requestedDate) {
          events.push({
            id: `guidance-${guidance.id}`,
            title: `Bimbingan - ${guidance.supervisor?.user?.fullName || "Dosen"}`,
            description: guidance.studentNotes || "Sesi bimbingan tugas akhir",
            type:
              guidance.status === "accepted"
                ? "guidance_scheduled"
                : guidance.status === "requested"
                  ? "guidance_request"
                  : "guidance_rejected",
            status: guidance.status,
            startDate: guidance.requestedDate,
            endDate: guidance.requestedDate,
            userId,
            userRole,
            relatedId: guidance.id,
            relatedType: "thesis_guidance",
            participants: [
              {
                userId: guidance.supervisor?.user?.id,
                name: guidance.supervisor?.user?.fullName,
                role: ROLE_CATEGORY.LECTURER,
              },
            ],
            location: null,
            meetingLink: null,
            reminderMinutes: 30,
            notificationSent: false,
            color: "#3b82f6",
            backgroundColor: "#3b82f6",
          });
        }
      });


      // Get thesis seminar events
      const seminars = await prisma.thesisSeminar.findMany({
        where: {
          thesis: { studentId: user.student.id },
          date: { not: null },
          ...(startDate && endDate && {
            date: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        },
        include: { room: true },
      });

      seminars.forEach((s) => {
        events.push({
          id: `seminar-${s.id}`,
          title: "Seminar Hasil",
          description: "Seminar hasil tugas akhir",
          type: "seminar_scheduled",
          status: s.status,
          startDate: s.startTime || s.date,
          endDate: s.endTime || s.date,
          userId,
          userRole,
          relatedId: s.id,
          relatedType: "thesis_seminar",
          location: s.room?.name || s.meetingLink || "TBA",
          meetingLink: s.meetingLink,
          reminderMinutes: 60,
          color: "#8b5cf6",
          backgroundColor: "#8b5cf6",
        });
      });

      // Get thesis defence events
      const defences = await prisma.thesisDefence.findMany({
        where: {
          thesis: { studentId: user.student.id },
          date: { not: null },
          ...(startDate && endDate && {
            date: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        },
        include: { room: true },
      });

      defences.forEach((d) => {
        events.push({
          id: `defence-${d.id}`,
          title: "Sidang Tugas Akhir",
          description: "Ujian sidang tugas akhir",
          type: "defense_scheduled",
          status: d.status,
          startDate: d.startTime || d.date,
          endDate: d.endTime || d.date,
          userId,
          userRole,
          relatedId: d.id,
          relatedType: "thesis_defence",
          location: d.room?.name || d.meetingLink || "TBA",
          meetingLink: d.meetingLink,
          reminderMinutes: 60,
          color: "#f97316",
          backgroundColor: "#f97316",
        });
      });
    }

    // Lecturer events
    if (userRole === ROLE_CATEGORY.LECTURER && user.lecturer) {
      console.log('[Calendar Service] ===== LECTURER SECTION =====');
      console.log('[Calendar Service] Fetching lecturer guidances for lecturer ID:', user.lecturer.id);
      console.log('[Calendar Service] Date range:', { startDate, endDate });

      // Debug: Check total guidances for this lecturer (any status)
      const totalGuidances = await prisma.thesisGuidance.count({
        where: { supervisorId: user.lecturer.id }
      });
      console.log('[Calendar Service] Total guidances (all statuses) for this lecturer:', totalGuidances);

      const acceptedCount = await prisma.thesisGuidance.count({
        where: {
          supervisorId: user.lecturer.id,
          status: "accepted"
        }
      });
      console.log('[Calendar Service] Accepted guidances count:', acceptedCount);

      // Guidance requests - only show accepted guidances in calendar
      const guidances = await prisma.thesisGuidance.findMany({
        where: {
          supervisorId: user.lecturer.id,
          status: "accepted", // Only show accepted guidances in lecturer calendar
          ...(startDate &&
            endDate && {
            requestedDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        },
        include: {
          thesis: {
            include: {
              student: {
                include: {
                  user: true,
                },
              },
            },
          },
        },
      });

      console.log('[Calendar Service] Found lecturer guidances:', guidances.length);
      console.log('[Calendar Service] Guidances:', guidances.map(g => ({
        id: g.id,
        status: g.status,
        supervisorId: g.supervisorId,
        requestedDate: g.requestedDate,
        studentName: g.thesis?.student?.user?.fullName
      })));

      guidances.forEach((guidance) => {
        if (guidance.requestedDate) {
          console.log('[Calendar Service] Adding guidance event:', guidance.id);
          events.push({
            id: `guidance-${guidance.id}`,
            title: `Bimbingan - ${guidance.thesis.student.user.fullName}`,
            description: guidance.studentNotes || "Sesi bimbingan mahasiswa",
            type:
              guidance.status === "accepted"
                ? "student_guidance"
                : guidance.status === "requested"
                  ? "guidance_request"
                  : "guidance_rejected",
            status: guidance.status,
            startDate: guidance.requestedDate,
            endDate: guidance.requestedDate,
            userId,
            userRole,
            relatedId: guidance.id,
            relatedType: "thesis_guidance",
            participants: [
              {
                userId: guidance.thesis.student.user.id,
                name: guidance.thesis.student.user.fullName,
                role: ROLE_CATEGORY.STUDENT,
              },
            ],
            location: null,
            meetingLink: null,
            reminderMinutes: 30,
            notificationSent: false,
            color: "#14b8a6",
            backgroundColor: "#14b8a6",
          });
        }
      });

      // Get seminars for lecturer (supervisor or examiner)
      const seminars = await prisma.thesisSeminar.findMany({
        where: {
          OR: [
            { thesis: { thesisSupervisors: { some: { lecturerId: user.lecturer.id } } } },
            { examiners: { some: { lecturerId: user.lecturer.id } } }
          ],
          date: { not: null },
          ...(startDate && endDate && {
            date: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        },
        include: {
          thesis: { include: { student: { include: { user: true } } } },
          room: true,
          examiners: true
        },
      });

      seminars.forEach(s => {
        const isExaminer = s.examiners.some(e => e.lecturerId === user.lecturer.id);
        events.push({
          id: `seminar-${s.id}`,
          title: `Seminar: ${s.thesis.student.user.fullName}`,
          description: `Seminar hasil mahasiswa ${s.thesis.student.user.fullName}`,
          type: isExaminer ? "seminar_as_examiner" : "seminar_scheduled",
          status: s.status,
          startDate: s.startTime || s.date,
          endDate: s.endTime || s.date,
          userId,
          userRole,
          relatedId: s.id,
          relatedType: "thesis_seminar",
          location: s.room?.name || s.meetingLink || "TBA",
          meetingLink: s.meetingLink,
          reminderMinutes: 60,
          color: isExaminer ? "#6366f1" : "#8b5cf6",
          backgroundColor: isExaminer ? "#6366f1" : "#8b5cf6",
        });
      });

      // Get defences for lecturer (supervisor or examiner)
      const defences = await prisma.thesisDefence.findMany({
        where: {
          OR: [
            { thesis: { thesisSupervisors: { some: { lecturerId: user.lecturer.id } } } },
            { examiners: { some: { lecturerId: user.lecturer.id } } }
          ],
          date: { not: null },
          ...(startDate && endDate && {
            date: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          }),
        },
        include: {
          thesis: { include: { student: { include: { user: true } } } },
          room: true,
          examiners: true
        },
      });

      defences.forEach(d => {
        const isExaminer = d.examiners.some(e => e.lecturerId === user.lecturer.id);
        events.push({
          id: `defence-${d.id}`,
          title: `Sidang: ${d.thesis.student.user.fullName}`,
          description: `Sidang tugas akhir mahasiswa ${d.thesis.student.user.fullName}`,
          type: isExaminer ? "defense_as_examiner" : "defense_scheduled",
          status: d.status,
          startDate: d.startTime || d.date,
          endDate: d.endTime || d.date,
          userId,
          userRole,
          relatedId: d.id,
          relatedType: "thesis_defence",
          location: d.room?.name || d.meetingLink || "TBA",
          meetingLink: d.meetingLink,
          reminderMinutes: 60,
          color: isExaminer ? "#ea580c" : "#f97316",
          backgroundColor: isExaminer ? "#ea580c" : "#f97316",
        });
      });

    }

    // Filter by types if provided
    let filteredEvents = events;
    console.log('[Calendar Service] Total events before filter:', events.length);
    console.log('[Calendar Service] Filter types:', types);
    if (types && types.length > 0 && !types.includes("all")) {
      filteredEvents = events.filter((event) => types.includes(event.type));
      console.log('[Calendar Service] Events after type filter:', filteredEvents.length);
    }

    console.log('[Calendar Service] Returning events:', filteredEvents.length);
    console.log('[Calendar Service] Event types:', filteredEvents.map(e => ({ id: e.id, type: e.type, title: e.title })));

    return {
      events: filteredEvents.sort(
        (a, b) => new Date(a.startDate) - new Date(b.startDate)
      ),
    };
  } catch (error) {
    console.error("Error getting calendar events:", error);
    throw error;
  }
}

/**
 * Get upcoming events (next N days)
 */
export async function getUpcomingEvents(userId, userRole, days = 7) {
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  return getMyCalendarEvents(userId, userRole, {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  });
}

/**
 * Get event statistics
 */
export async function getEventStatistics(userId, userRole) {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));
    const next7Days = new Date();
    next7Days.setDate(next7Days.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    // Get all events
    const allEvents = await getMyCalendarEvents(userId, userRole, {
      startDate: todayStart.toISOString(),
      endDate: next7Days.toISOString(),
    });

    const monthEvents = await getMyCalendarEvents(userId, userRole, {
      startDate: monthStart.toISOString(),
      endDate: monthEnd.toISOString(),
    });

    // Count today's events
    const todayEvents = allEvents.events.filter((event) => {
      const eventDate = new Date(event.startDate);
      return eventDate >= todayStart && eventDate <= todayEnd;
    }).length;

    // Count upcoming events (next 7 days)
    const upcomingEvents = allEvents.events.length;

    // Count accepted this month
    const completedThisMonth = monthEvents.events.filter(
      (event) => event.status === "accepted"
    ).length;

    // Count pending actions (requested status)
    const pendingActions = allEvents.events.filter(
      (event) => event.status === "requested"
    ).length;

    return {
      todayEvents,
      upcomingEvents,
      completedThisMonth,
      pendingActions,
    };
  } catch (error) {
    console.error("Error getting event statistics:", error);
    throw error;
  }
}
