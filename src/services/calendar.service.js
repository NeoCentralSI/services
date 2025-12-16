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
              approvedDate: {
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
        if (guidance.approvedDate) {
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
            startDate: guidance.approvedDate,
            endDate: guidance.approvedDate,
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
            meetingLink: guidance.meetingUrl,
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
          thesis: {
            studentId: user.student.id,
          },
          ...(startDate &&
            endDate && {
              schedule: {
                startTime: {
                  gte: new Date(startDate),
                  lte: new Date(endDate),
                },
              },
            }),
        },
        include: {
          schedule: {
            include: {
              room: true,
            },
          },
        },
      });

      seminars.forEach((seminar) => {
        if (seminar.schedule) {
          events.push({
            id: `seminar-${seminar.id}`,
            title: "Seminar Tugas Akhir",
            description: "Presentasi dan diskusi hasil penelitian",
            type: "seminar_scheduled",
            status: seminar.status,
            startDate: seminar.schedule.startTime,
            endDate: seminar.schedule.endTime,
            userId,
            userRole,
            relatedId: seminar.id,
            relatedType: "thesis_seminar",
            participants: [],
            location: seminar.schedule.room?.name,
            meetingLink: null,
            reminderMinutes: 60,
            notificationSent: false,
            color: "#8b5cf6",
            backgroundColor: "#8b5cf6",
          });
        }
      });

      // Get thesis defence events
      const defences = await prisma.thesisDefence.findMany({
        where: {
          thesis: {
            studentId: user.student.id,
          },
          ...(startDate &&
            endDate && {
              schedule: {
                startTime: {
                  gte: new Date(startDate),
                  lte: new Date(endDate),
                },
              },
            }),
        },
        include: {
          schedule: {
            include: {
              room: true,
            },
          },
        },
      });

      defences.forEach((defence) => {
        if (defence.schedule) {
          events.push({
            id: `defence-${defence.id}`,
            title: "Sidang Tugas Akhir",
            description: "Ujian sidang tugas akhir",
            type: "defense_scheduled",
            status: "scheduled",
            startDate: defence.schedule.startTime,
            endDate: defence.schedule.endTime,
            userId,
            userRole,
            relatedId: defence.id,
            relatedType: "thesis_defence",
            participants: [],
            location: defence.schedule.room?.name,
            meetingLink: null,
            reminderMinutes: 60,
            notificationSent: false,
            color: "#f59e0b",
            backgroundColor: "#f59e0b",
          });
        }
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
              approvedDate: {
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
        approvedDate: g.approvedDate,
        studentName: g.thesis?.student?.user?.fullName
      })));

      guidances.forEach((guidance) => {
        if (guidance.approvedDate) {
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
            startDate: guidance.approvedDate,
            endDate: guidance.approvedDate,
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
            location: guidance.location || null,
            meetingLink: guidance.meetingUrl,
            reminderMinutes: 30,
            notificationSent: false,
            color: "#14b8a6",
            backgroundColor: "#14b8a6",
          });
        }
      });

      // Seminars as examiner
      const seminarAudiences = await prisma.thesisSeminarAudience.findMany({
        where: {
          validator: {
            userId: userId,
          },
          ...(startDate &&
            endDate && {
              seminar: {
                schedule: {
                  startTime: {
                    gte: new Date(startDate),
                    lte: new Date(endDate),
                  },
                },
              },
            }),
        },
        include: {
          seminar: {
            include: {
              schedule: {
                include: {
                  room: true,
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
          },
        },
      });

      seminarAudiences.forEach((audience) => {
        if (audience.seminar?.schedule) {
          events.push({
            id: `seminar-examiner-${audience.seminar.id}`,
            title: `Seminar - ${audience.seminar.thesis.student.user.fullName}`,
            description: "Sebagai penguji seminar",
            type: "seminar_as_examiner",
            status: audience.seminar.status,
            startDate: audience.seminar.schedule.startTime,
            endDate: audience.seminar.schedule.endTime,
            userId,
            userRole,
            relatedId: audience.seminar.id,
            relatedType: "thesis_seminar",
            participants: [
              {
                userId: audience.seminar.thesis.student.user.id,
                name: audience.seminar.thesis.student.user.fullName,
                role: ROLE_CATEGORY.STUDENT,
              },
            ],
            location: audience.seminar.schedule.room?.name,
            meetingLink: null,
            reminderMinutes: 60,
            notificationSent: false,
            color: "#6366f1",
            backgroundColor: "#6366f1",
          });
        }
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
