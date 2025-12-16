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
 * Format date for Outlook API (ISO 8601)
 * @param {Date} date 
 * @returns {Object} DateTime object for Graph API
 */
function formatDateTimeForOutlook(date) {
  return {
    dateTime: date.toISOString().slice(0, -1), // Remove Z
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
    isOnlineMeeting = false,
    meetingUrl,
  } = eventData;

  const accessToken = await getValidAccessToken(userId);

  // Build attendees array
  const attendeesList = attendees.map((email) => ({
    emailAddress: { address: email },
    type: "required",
  }));

  const event = {
    subject,
    body: {
      contentType: "HTML",
      content: body || "",
    },
    start: formatDateTimeForOutlook(new Date(startTime)),
    end: formatDateTimeForOutlook(new Date(endTime)),
    attendees: attendeesList,
    isOnlineMeeting,
    onlineMeetingProvider: isOnlineMeeting ? "teamsForBusiness" : undefined,
  };

  // Add location or meeting URL
  if (location) {
    event.location = { displayName: location };
  } else if (meetingUrl) {
    event.location = { displayName: "Online Meeting", locationUri: meetingUrl };
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

    return response.data.value.map((event) => ({
      id: event.id,
      subject: event.subject,
      start: event.start.dateTime,
      end: event.end.dateTime,
      location: event.location?.displayName,
      webLink: event.webLink,
      isOnlineMeeting: event.isOnlineMeeting,
      onlineMeetingUrl: event.onlineMeeting?.joinUrl,
    }));
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
    },
  });

  // User has calendar access if they're connected to Microsoft and have an access token
  // The actual calendar permission was checked during login
  if (user?.oauthProvider !== "microsoft" || !user?.oauthAccessToken) {
    return false;
  }

  // Try to verify the token is still valid by testing calendar access
  try {
    await axios.get(`${GRAPH_API_BASE}/me/calendars`, {
      headers: {
        Authorization: `Bearer ${user.oauthAccessToken}`,
      },
    });
    return true;
  } catch (error) {
    console.log("[OutlookCalendar] Calendar access check failed:", error.response?.status);
    // Token might be expired, but we still consider them as having calendar access
    // The actual refresh will happen when they try to sync
    return user?.oauthProvider === "microsoft" && !!user?.oauthAccessToken;
  }
}

/**
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

  const eventData = {
    subject: `Bimbingan Tugas Akhir - ${student.fullName}`,
    body: `
      <p><strong>Bimbingan Tugas Akhir</strong></p>
      <p>Mahasiswa: ${student.fullName}</p>
      <p>Pembimbing: ${supervisor.fullName}</p>
      ${guidance.studentNotes ? `<p>Catatan: ${guidance.studentNotes}</p>` : ""}
      ${guidance.meetingUrl ? `<p>Link Meeting: <a href="${guidance.meetingUrl}">${guidance.meetingUrl}</a></p>` : ""}
      ${guidance.location ? `<p>Lokasi: ${guidance.location}</p>` : ""}
      ${guidance.type ? `<p>Tipe: ${guidance.type === 'online' ? 'Online' : 'Offline'}</p>` : ""}
    `,
    startTime,
    endTime,
    meetingUrl: guidance.meetingUrl,
    isOnlineMeeting: !!guidance.meetingUrl || guidance.type === 'online',
    location: guidance.location,
  };

  // Create event for supervisor (if connected to Microsoft)
  if (await hasCalendarAccess(supervisor.userId)) {
    try {
      const supervisorEvent = await createCalendarEvent(supervisor.userId, {
        ...eventData,
        attendees: student.email ? [student.email] : [],
      });
      results.supervisorEventId = supervisorEvent.eventId;
      console.log("[OutlookCalendar] Created supervisor event:", supervisorEvent.eventId);
    } catch (error) {
      console.error("[OutlookCalendar] Failed to create supervisor event:", error.message);
    }
  }

  // Create event for student (if connected to Microsoft)
  if (await hasCalendarAccess(student.userId)) {
    try {
      const studentEvent = await createCalendarEvent(student.userId, {
        ...eventData,
        subject: `Bimbingan TA dengan ${supervisor.fullName}`,
        attendees: supervisor.email ? [supervisor.email] : [],
      });
      results.studentEventId = studentEvent.eventId;
      console.log("[OutlookCalendar] Created student event:", studentEvent.eventId);
    } catch (error) {
      console.error("[OutlookCalendar] Failed to create student event:", error.message);
    }
  }

  return results;
}
