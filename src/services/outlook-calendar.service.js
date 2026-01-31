// src/services/outlook-calendar.service.js
import axios from "axios";
import { ENV } from "../config/env.js";
import prisma from "../config/prisma.js";

const GRAPH_API_BASE = "https://graph.microsoft.com/v1.0";
const MICROSOFT_TOKEN_URL = `https://login.microsoftonline.com/${ENV.TENANT_ID}/oauth2/v2.0/token`;

/**
 * Get calendar scopes needed for Outlook integration
 */
export const CALENDAR_SCOPES = [
  "user.read",
  "openid",
  "profile",
  "email",
  "Calendars.ReadWrite",
  "offline_access",
];

/**
 * Refresh Microsoft access token using refresh token (direct HTTP)
 * @param {string} refreshToken - OAuth refresh token
 * @returns {Promise<Object>} New tokens
 */
async function refreshMicrosoftToken(refreshToken) {
  try {
    const response = await axios.post(
      MICROSOFT_TOKEN_URL,
      new URLSearchParams({
        client_id: ENV.CLIENT_ID,
        client_secret: ENV.CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: CALENDAR_SCOPES.join(' '),
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return {
      accessToken: response.data.access_token,
      refreshToken: response.data.refresh_token || refreshToken,
    };
  } catch (error) {
    console.error("[OutlookCalendar] Failed to refresh token:", error.response?.data || error.message);
    throw new Error("Failed to refresh Microsoft token");
  }
}

/**
 * Get valid access token for a user (refresh if needed)
 * @param {string} userId - User ID
 * @returns {Promise<string>} Valid access token
 */
async function getValidAccessToken(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      oauthProvider: true,
      oauthAccessToken: true,
      oauthRefreshToken: true,
    },
  });

  if (!user || user.oauthProvider !== "microsoft") {
    throw new Error("User is not connected to Microsoft account");
  }

  if (!user.oauthAccessToken) {
    throw new Error("Microsoft OAuth access token not found. Please reconnect your account.");
  }

  // Try to use existing token first
  try {
    // Test if token is valid by making a simple request
    await axios.get(`${GRAPH_API_BASE}/me`, {
      headers: { Authorization: `Bearer ${user.oauthAccessToken}` },
    });
    return user.oauthAccessToken;
  } catch (error) {
    if (error.response?.status === 401) {
      // Token expired
      if (!user.oauthRefreshToken) {
        throw new Error("Access token expired and no refresh token available. Please login again with Microsoft.");
      }
      
      // Try to refresh the token
      console.log("[OutlookCalendar] Access token expired, refreshing...");
      const newTokens = await refreshMicrosoftToken(user.oauthRefreshToken);

      // Update tokens in database
      await prisma.user.update({
        where: { id: userId },
        data: {
          oauthAccessToken: newTokens.accessToken,
          oauthRefreshToken: newTokens.refreshToken,
        },
      });

      return newTokens.accessToken;
    }
    throw error;
  }
}

/**
 * Format date for Outlook API (ISO 8601) in Jakarta timezone
 * @param {Date} date 
 * @returns {Object} DateTime object for Graph API
 */
function formatDateTimeForOutlook(date) {
  // Convert to Jakarta timezone string and format for Graph API
  const jakartaDate = new Date(date);
  
  // Get the date/time components in Jakarta timezone
  const options = {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  
  const formatter = new Intl.DateTimeFormat('sv-SE', options);
  const parts = formatter.formatToParts(jakartaDate);
  
  // Build ISO format string: YYYY-MM-DDTHH:mm:ss
  const getPart = (type) => parts.find(p => p.type === type)?.value || '00';
  const dateTimeString = `${getPart('year')}-${getPart('month')}-${getPart('day')}T${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  
  return {
    dateTime: dateTimeString,
    timeZone: "Asia/Jakarta",
  };
}

/**
 * Create a calendar event in user's Outlook calendar
 * @param {string} userId - User ID who owns the calendar
 * @param {Object} eventData - Event details
 * @returns {Promise<Object>} Created event
 */
export async function createCalendarEvent(userId, eventData) {
  const {
    subject,
    body,
    startTime,
    endTime,
    location,
    attendees = [],
  } = eventData;

  const accessToken = await getValidAccessToken(userId);

  // Build attendees array (empty for personal events)
  const attendeesList = attendees.map((email) => ({
    emailAddress: { address: email },
    type: "optional",
  }));

  const event = {
    subject,
    body: {
      contentType: "text",
      content: body || "",
    },
    start: formatDateTimeForOutlook(new Date(startTime)),
    end: formatDateTimeForOutlook(new Date(endTime)),
    attendees: attendeesList,
    isOnlineMeeting: false,
    responseRequested: false,
  };

  // Add location if provided
  if (location) {
    event.location = { displayName: location };
  }

  try {
    const response = await axios.post(
      `${GRAPH_API_BASE}/me/events`,
      event,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[OutlookCalendar] Event created:", response.data.id);
    return {
      eventId: response.data.id,
      webLink: response.data.webLink,
      onlineMeetingUrl: response.data.onlineMeeting?.joinUrl,
    };
  } catch (error) {
    console.error("[OutlookCalendar] Failed to create event:", error.response?.data || error.message);
    throw new Error(`Failed to create calendar event: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Update an existing calendar event
 * @param {string} userId - User ID
 * @param {string} eventId - Outlook event ID
 * @param {Object} eventData - Updated event details
 * @returns {Promise<Object>} Updated event
 */
export async function updateCalendarEvent(userId, eventId, eventData) {
  const accessToken = await getValidAccessToken(userId);

  const updatePayload = {};

  if (eventData.subject) updatePayload.subject = eventData.subject;
  if (eventData.body) {
    updatePayload.body = { contentType: "HTML", content: eventData.body };
  }
  if (eventData.startTime) {
    updatePayload.start = formatDateTimeForOutlook(new Date(eventData.startTime));
  }
  if (eventData.endTime) {
    updatePayload.end = formatDateTimeForOutlook(new Date(eventData.endTime));
  }
  if (eventData.location) {
    updatePayload.location = { displayName: eventData.location };
  }

  try {
    const response = await axios.patch(
      `${GRAPH_API_BASE}/me/events/${eventId}`,
      updatePayload,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[OutlookCalendar] Event updated:", eventId);
    return {
      eventId: response.data.id,
      webLink: response.data.webLink,
    };
  } catch (error) {
    console.error("[OutlookCalendar] Failed to update event:", error.response?.data || error.message);
    throw new Error(`Failed to update calendar event: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Delete a calendar event
 * @param {string} userId - User ID
 * @param {string} eventId - Outlook event ID
 */
export async function deleteCalendarEvent(userId, eventId) {
  const accessToken = await getValidAccessToken(userId);

  try {
    await axios.delete(`${GRAPH_API_BASE}/me/events/${eventId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log("[OutlookCalendar] Event deleted:", eventId);
    return true;
  } catch (error) {
    // If event not found, consider it already deleted
    if (error.response?.status === 404) {
      console.log("[OutlookCalendar] Event already deleted or not found:", eventId);
      return true;
    }
    console.error("[OutlookCalendar] Failed to delete event:", error.response?.data || error.message);
    throw new Error(`Failed to delete calendar event: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Get user's calendar events within a date range
 * @param {string} userId - User ID
 * @param {Date} startDate - Start of date range
 * @param {Date} endDate - End of date range
 * @returns {Promise<Array>} List of events
 */
export async function getCalendarEvents(userId, startDate, endDate) {
  let accessToken;
  try {
    accessToken = await getValidAccessToken(userId);
  } catch (error) {
    // If token expired or not available, return empty array instead of throwing
    console.log("[OutlookCalendar] Cannot get access token, returning empty events:", error.message);
    return [];
  }

  const params = new URLSearchParams({
    startDateTime: startDate.toISOString(),
    endDateTime: endDate.toISOString(),
    $orderby: "start/dateTime",
    $top: "50",
  });

  try {
    const response = await axios.get(
      `${GRAPH_API_BASE}/me/calendarView?${params}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    return response.data.value.map((event) => {
      // Convert Outlook event times to proper Jakarta timezone for consistent display
      // Graph API returns times in the timezone specified in the event
      // We need to ensure they're properly formatted for frontend consumption
      console.log('[OutlookCalendar] Raw event from Graph API:', {
        id: event.id,
        subject: event.subject,
        start: event.start,
        end: event.end,
        timezone: event.start?.timeZone
      });
      
      // Parse datetime and handle timezone conversion properly
      const parseEventDateTime = (eventDateTime) => {
        if (!eventDateTime) return null;
        
        // If timezone is specified, use it; otherwise assume Jakarta
        const timezone = eventDateTime.timeZone || 'Asia/Jakarta';
        
        // Create a date object from the datetime
        let date;
        if (timezone === 'Asia/Jakarta') {
          // If it's already Jakarta time, parse directly
          date = new Date(`${eventDateTime.dateTime}+07:00`);
        } else {
          // Parse the datetime and convert to Jakarta
          const tempDate = new Date(eventDateTime.dateTime);
          // Convert to Jakarta timezone
          date = new Date(tempDate.toLocaleString("en-US", {timeZone: "Asia/Jakarta"}));
        }
        
        return date.toISOString();
      };
      
      const convertedStart = parseEventDateTime(event.start);
      const convertedEnd = parseEventDateTime(event.end);
      
      console.log('[OutlookCalendar] Converted event times:', {
        id: event.id,
        subject: event.subject,
        originalStart: event.start?.dateTime,
        convertedStart,
        originalEnd: event.end?.dateTime, 
        convertedEnd,
        timezone: event.start?.timeZone
      });
      
      return {
        id: event.id,
        subject: event.subject,
        start: convertedStart,
        end: convertedEnd,
        location: event.location?.displayName,
        webLink: event.webLink,
        isOnlineMeeting: event.isOnlineMeeting,
        onlineMeetingUrl: event.onlineMeeting?.joinUrl,
      };
    });
  } catch (error) {
    console.error("[OutlookCalendar] Failed to get events:", error.response?.data || error.message);
    throw new Error(`Failed to get calendar events: ${error.response?.data?.error?.message || error.message}`);
  }
}

/**
 * Check if user has calendar access (connected Microsoft account with calendar scope)
 * @param {string} userId - User ID
 * @returns {Promise<boolean>}
 */
export async function hasCalendarAccess(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      oauthProvider: true,
      oauthAccessToken: true,
      oauthRefreshToken: true,
    },
  });

  // User has calendar access if they're connected to Microsoft and have an access token
  // The actual calendar permission was checked during login
  if (user?.oauthProvider !== "microsoft" || !user?.oauthAccessToken) {
    console.log("[OutlookCalendar] hasCalendarAccess: No Microsoft connection for user", userId);
    return false;
  }

  // Try to verify the token is still valid by testing calendar access
  try {
    await axios.get(`${GRAPH_API_BASE}/me/calendars`, {
      headers: {
        Authorization: `Bearer ${user.oauthAccessToken}`,
      },
    });
    console.log("[OutlookCalendar] hasCalendarAccess: Token valid for user", userId);
    return true;
  } catch (error) {
    console.log("[OutlookCalendar] Calendar access check failed:", error.response?.status, "for user", userId);
    
    // Try to refresh token if expired
    if (error.response?.status === 401 && user.oauthRefreshToken) {
      try {
        console.log("[OutlookCalendar] Attempting token refresh for calendar access check...");
        const newTokens = await refreshMicrosoftToken(user.oauthRefreshToken);
        
        // Update tokens in database
        await prisma.user.update({
          where: { id: userId },
          data: {
            oauthAccessToken: newTokens.accessToken,
            oauthRefreshToken: newTokens.refreshToken,
          },
        });
        
        console.log("[OutlookCalendar] Token refreshed successfully for user", userId);
        return true;
      } catch (refreshError) {
        console.error("[OutlookCalendar] Failed to refresh token:", refreshError.message);
        return false;
      }
    }
    
    return false;
  }
}

/**
 * Create guidance event for supervisor only (single event)
 * When supervisor approves guidance, create event in supervisor's calendar
 * @param {Object} guidance - Guidance data with scheduledDate
 * @param {Object} student - Student user data
 * @param {Object} supervisor - Supervisor user data (lecturer)
 * @returns {Promise<string|null>} Created event ID or null
 */
export async function createGuidanceCalendarEvent(guidance, student, supervisor) {
  console.log("[OutlookCalendar] createGuidanceCalendarEvent called with:", {
    guidance: {
      scheduledDate: guidance.scheduledDate,
      duration: guidance.duration,
    },
    student: { userId: student.userId, fullName: student.fullName, email: student.email },
    supervisor: { userId: supervisor.userId, fullName: supervisor.fullName, email: supervisor.email },
  });

  // Use scheduledDate (the date student requested for the guidance)
  const scheduledAt = guidance.scheduledDate;
  if (!scheduledAt) {
    console.log("[OutlookCalendar] No schedule date, skipping calendar sync");
    return { supervisorEventId: null, studentEventId: null };
  }

  const startTime = new Date(scheduledAt);
  // Use duration from guidance if available, default to 60 minutes
  const durationMinutes = guidance.duration || 60;
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  console.log("[OutlookCalendar] Event times:", {
    scheduledAt,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMinutes,
    formattedStart: formatDateTimeForOutlook(startTime),
    formattedEnd: formatDateTimeForOutlook(endTime),
  });

  const results = {
    supervisorEventId: null,
    studentEventId: null,
  };

  // Build clean event description for supervisor
  let supervisorBody = [];
  supervisorBody.push(`Mahasiswa: ${student.fullName}`);
  if (guidance.studentNotes) {
    supervisorBody.push(`Agenda: ${guidance.studentNotes}`);
  }

  // Build clean event description for student
  let studentBody = [];
  studentBody.push(`Pembimbing: ${supervisor.fullName}`);
  if (guidance.studentNotes) {
    studentBody.push(`Agenda: ${guidance.studentNotes}`);
  }

  // Create event for SUPERVISOR (if connected to Microsoft)
  const supervisorHasAccess = await hasCalendarAccess(supervisor.userId);
  console.log("[OutlookCalendar] Supervisor calendar access:", supervisorHasAccess);
  
  if (supervisorHasAccess) {
    try {
      const supervisorEvent = await createCalendarEvent(supervisor.userId, {
        subject: `Bimbingan TA - ${student.fullName}`,
        body: supervisorBody.join('\n'),
        startTime,
        endTime,
        location: null,
        attendees: [],
      });
      results.supervisorEventId = supervisorEvent.eventId;
      console.log("[OutlookCalendar] Created supervisor event:", supervisorEvent.eventId);
    } catch (error) {
      console.error("[OutlookCalendar] Failed to create supervisor event:", error.message);
    }
  }

  // Create event for STUDENT (if connected to Microsoft)
  const studentHasAccess = await hasCalendarAccess(student.userId);
  console.log("[OutlookCalendar] Student calendar access:", studentHasAccess);
  
  if (studentHasAccess) {
    try {
      const studentEvent = await createCalendarEvent(student.userId, {
        subject: `Bimbingan TA - ${supervisor.fullName}`,
        body: studentBody.join('\n'),
        startTime,
        endTime,
        location: null,
        attendees: [],
      });
      results.studentEventId = studentEvent.eventId;
      console.log("[OutlookCalendar] Created student event:", studentEvent.eventId);
    } catch (error) {
      console.error("[OutlookCalendar] Failed to create student event:", error.message);
    }
  }

  console.log("[OutlookCalendar] Final results:", results);
  return results;
}

/**
 * @deprecated Use createGuidanceCalendarEvent instead (creates single event for supervisor)
 * Create guidance event for both student and supervisor
 * @param {Object} guidance - Guidance data
 * @param {Object} student - Student user data
 * @param {Object} supervisor - Supervisor user data (lecturer)
 * @returns {Promise<Object>} Created event IDs
 */
export async function createGuidanceCalendarEvents(guidance, student, supervisor) {
  const results = {
    studentEventId: null,
    supervisorEventId: null,
  };

  console.log("[OutlookCalendar] createGuidanceCalendarEvents called with:", {
    guidance: {
      approvedDate: guidance.approvedDate,
      requestedDate: guidance.requestedDate,
      duration: guidance.duration,
    },
    student: { userId: student.userId, fullName: student.fullName, email: student.email },
    supervisor: { userId: supervisor.userId, fullName: supervisor.fullName, email: supervisor.email },
  });

  // Use approvedDate (new schema) or fall back to legacy properties
  const scheduledAt = guidance.approvedDate || guidance.requestedDate;
  if (!scheduledAt) {
    console.log("[OutlookCalendar] No schedule date, skipping calendar sync");
    return results;
  }

  const startTime = new Date(scheduledAt);
  // Use duration from guidance if available, default to 60 minutes
  const durationMinutes = guidance.duration || 60;
  const endTime = new Date(startTime.getTime() + durationMinutes * 60 * 1000);

  console.log("[OutlookCalendar] Event times:", {
    scheduledAt,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    durationMinutes,
    formattedStart: formatDateTimeForOutlook(startTime),
    formattedEnd: formatDateTimeForOutlook(endTime),
  });

  const eventData = {
    subject: `Bimbingan Tugas Akhir - ${student.fullName}`,
    body: `
      <p><strong>Bimbingan Tugas Akhir</strong></p>
      <p>Mahasiswa: ${student.fullName}</p>
      <p>Pembimbing: ${supervisor.fullName}</p>
      ${guidance.studentNotes ? `<p>Catatan: ${guidance.studentNotes}</p>` : ""}
    `,
    startTime,
    endTime,
    isOnlineMeeting: false,
    location: null,
  };

  // Create event for supervisor (if connected to Microsoft)
  const supervisorHasAccess = await hasCalendarAccess(supervisor.userId);
  console.log("[OutlookCalendar] Supervisor calendar access:", supervisorHasAccess);
  
  if (supervisorHasAccess) {
    try {
      const supervisorEvent = await createCalendarEvent(supervisor.userId, {
        ...eventData,
        attendees: student.email ? [student.email] : [],
      });
      results.supervisorEventId = supervisorEvent.eventId;
      console.log("[OutlookCalendar] Created supervisor event:", supervisorEvent.eventId);
    } catch (error) {
      console.error("[OutlookCalendar] Failed to create supervisor event:", error.message, error.stack);
    }
  } else {
    console.log("[OutlookCalendar] Supervisor does not have calendar access, skipping supervisor event");
  }

  // Create event for student (if connected to Microsoft)
  const studentHasAccess = await hasCalendarAccess(student.userId);
  console.log("[OutlookCalendar] Student calendar access:", studentHasAccess);
  
  if (studentHasAccess) {
    try {
      const studentEvent = await createCalendarEvent(student.userId, {
        ...eventData,
        subject: `Bimbingan TA dengan ${supervisor.fullName}`,
        attendees: supervisor.email ? [supervisor.email] : [],
      });
      results.studentEventId = studentEvent.eventId;
      console.log("[OutlookCalendar] Created student event:", studentEvent.eventId);
    } catch (error) {
      console.error("[OutlookCalendar] Failed to create student event:", error.message, error.stack);
    }
  } else {
    console.log("[OutlookCalendar] Student does not have calendar access, skipping student event");
  }

  console.log("[OutlookCalendar] Final results:", results);
  return results;
}
