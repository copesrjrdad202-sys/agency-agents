import { config } from '../config';
import { AvailabilitySlot, BookingDetails } from '../types';
import { BusinessRecord, getDefaultBusinessConfig } from './businessStore';
import { getGoogleCalendarAuth } from './googleCalendarAuth';

/**
 * Integration Layer: calendar availability + booking.
 * Two providers are supported:
 *  - "mock": in-memory calendar, perfect for demos/tests with zero external setup.
 *  - "google": real Google Calendar API (requires a service account with Calendar
 *    scope shared on the target calendar, and GOOGLE_CALENDAR_ID set).
 */

const BUSINESS_HOURS_START = 8; // 8am
const BUSINESS_HOURS_END = 18; // 6pm
const SLOT_MINUTES = 60;

// In-memory store of booked slots for the mock provider: `${date}T${time}` -> BookingDetails
const mockBookedSlots = new Map<string, BookingDetails>();

function generateDaySlots(): string[] {
  const slots: string[] = [];
  for (let hour = BUSINESS_HOURS_START; hour < BUSINESS_HOURS_END; hour++) {
    slots.push(`${hour.toString().padStart(2, '0')}:00`);
  }
  return slots;
}

export async function checkAvailability(
  date: string,
  time?: string,
  business: BusinessRecord = getDefaultBusinessConfig()
): Promise<AvailabilitySlot[]> {
  if (business.calendarProvider === 'google') {
    return checkAvailabilityGoogle(date, time, business);
  }
  if (business.calendarProvider === 'multi-agent') {
    return checkAvailabilityMultiAgent(date, time);
  }
  return checkAvailabilityMock(date, time);
}

function checkAvailabilityMock(date: string, time?: string): AvailabilitySlot[] {
  const candidateTimes = time ? [normalizeTime(time)] : generateDaySlots();
  return candidateTimes.map((t) => ({
    date,
    time: t,
    available: !mockBookedSlots.has(`${date}T${t}`),
  }));
}

async function checkAvailabilityGoogle(
  date: string,
  time?: string,
  business: BusinessRecord = getDefaultBusinessConfig()
): Promise<AvailabilitySlot[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { google } = require('googleapis');
    const auth = getGoogleCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = business.googleCalendarId || config.calendar.googleCalendarId;

    const timeMin = new Date(`${date}T00:00:00`).toISOString();
    const timeMax = new Date(`${date}T23:59:59`).toISOString();

    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin,
        timeMax,
        items: [{ id: calendarId }],
      },
    });

    const busy: Array<{ start: string; end: string }> =
      data.calendars?.[calendarId]?.busy || [];

    const candidateTimes = time ? [normalizeTime(time)] : generateDaySlots();

    return candidateTimes.map((t) => {
      const slotStart = new Date(`${date}T${t}:00`);
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60000);
      const overlaps = busy.some((b) => {
        const busyStart = new Date(b.start);
        const busyEnd = new Date(b.end);
        return slotStart < busyEnd && slotEnd > busyStart;
      });
      return { date, time: t, available: !overlaps };
    });
  } catch (err: any) {
    throw new Error(`Google Calendar availability check failed: ${err.message || err}`);
  }
}

export async function bookAppointment(
  details: BookingDetails,
  business: BusinessRecord = getDefaultBusinessConfig()
): Promise<{ confirmed: boolean; confirmationId: string; details: BookingDetails }> {
  const time = normalizeTime(details.time);
  const normalized = { ...details, time };

  if (business.calendarProvider === 'google') {
    return bookAppointmentGoogle(normalized, business);
  }
  if (business.calendarProvider === 'multi-agent') {
    return bookAppointmentMultiAgent(normalized);
  }
  return bookAppointmentMock(normalized);
}

function bookAppointmentMock(details: BookingDetails) {
  const key = `${details.date}T${details.time}`;
  if (mockBookedSlots.has(key)) {
    throw new Error(`Slot ${details.date} ${details.time} is already booked`);
  }
  mockBookedSlots.set(key, details);
  const confirmationId = `MOCK-${Date.now().toString(36).toUpperCase()}`;
  return { confirmed: true, confirmationId, details };
}

async function bookAppointmentGoogle(details: BookingDetails, business: BusinessRecord = getDefaultBusinessConfig()) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { google } = require('googleapis');
    const auth = getGoogleCalendarAuth();
    const calendar = google.calendar({ version: 'v3', auth });
    const calendarId = business.googleCalendarId || config.calendar.googleCalendarId;

    const start = new Date(`${details.date}T${details.time}:00`);
    const end = new Date(start.getTime() + SLOT_MINUTES * 60000);

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `${details.serviceType} - ${details.clientName}`,
        description: `Client: ${details.clientName}\nPhone: ${details.phoneNumber}\nService: ${details.serviceType}`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      },
    });

    return {
      confirmed: true,
      confirmationId: event.data.id || `GCAL-${Date.now()}`,
      details,
    };
  } catch (err: any) {
    throw new Error(`Google Calendar booking failed: ${err.message || err}`);
  }
}

/**
 * "multi-agent" provider: delegates to the Calendar Agent from the sibling
 * multi-agent-automation-system (see ../../examples/calendarAgent.ts and
 * ../../examples/automationAgent.ts), so voice bookings share the same
 * business calendar, reminder scheduling, and business context as the rest
 * of that system. Requires MULTI_AGENT_CALENDAR_URL and MULTI_AGENT_BUSINESS_ID.
 */
async function checkAvailabilityMultiAgent(
  date: string,
  time?: string
): Promise<AvailabilitySlot[]> {
  const { multiAgentCalendarUrl, multiAgentBusinessId } = config.calendar;
  const url = `${multiAgentCalendarUrl}/businesses/${encodeURIComponent(
    multiAgentBusinessId
  )}/availability?calendarId=primary`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Calendar Agent responded ${response.status}`);
    }
    const data: any = await response.json();
    const events: Array<{ start: { dateTime: string }; end: { dateTime: string } }> =
      data.availability || [];

    const candidateTimes = time ? [normalizeTime(time)] : generateDaySlots();
    return candidateTimes.map((t) => {
      const slotStart = new Date(`${date}T${t}:00`);
      const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60000);
      const overlaps = events.some((e) => {
        const evStart = new Date(e.start.dateTime);
        const evEnd = new Date(e.end.dateTime);
        return slotStart < evEnd && slotEnd > evStart;
      });
      return { date, time: t, available: !overlaps };
    });
  } catch (err: any) {
    throw new Error(`Multi-agent calendar availability check failed: ${err.message || err}`);
  }
}

async function bookAppointmentMultiAgent(details: BookingDetails) {
  const { multiAgentCalendarUrl, multiAgentBusinessId } = config.calendar;
  const url = `${multiAgentCalendarUrl}/businesses/${encodeURIComponent(
    multiAgentBusinessId
  )}/book`;

  const start = new Date(`${details.date}T${details.time}:00`);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: `${details.serviceType} - ${details.clientName}`,
        description: `Client: ${details.clientName}\nPhone: ${details.phoneNumber}\nBooked via Voice AI Agent.`,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Calendar Agent responded ${response.status}: ${body}`);
    }
    const data: any = await response.json();
    const confirmationId = data.created?.id || `MA-${Date.now().toString(36).toUpperCase()}`;

    // Best-effort: notify the Automation Agent so reminders/invoicing pick up this booking
    // the same way they would for a booking made through intake/automation agents.
    if (config.calendar.multiAgentAutomationUrl) {
      fetch(config.calendar.multiAgentAutomationUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: multiAgentBusinessId,
          caller: details.clientName,
          intent: {
            type: 'book',
            payload: {
              requested_time: start.toISOString(),
              service_name: details.serviceType,
              customer_email: `${details.phoneNumber.replace(/\D/g, '')}@voice-ai-agent.local`,
            },
          },
        }),
      }).catch(() => {
        /* best-effort side channel; booking already succeeded via Calendar Agent */
      });
    }

    return { confirmed: true, confirmationId, details };
  } catch (err: any) {
    throw new Error(`Multi-agent calendar booking failed: ${err.message || err}`);
  }
}

function normalizeTime(time: string): string {
  // Accepts "9:00", "09:00", "9am", "9:00 AM" etc. and normalizes to 24h "HH:MM".
  const trimmed = time.trim().toLowerCase();
  const ampmMatch = trimmed.match(/^(\d{1,2})(:(\d{2}))?\s*(am|pm)$/);
  if (ampmMatch) {
    let hour = parseInt(ampmMatch[1], 10);
    const minute = ampmMatch[3] || '00';
    const meridian = ampmMatch[4];
    if (meridian === 'pm' && hour !== 12) hour += 12;
    if (meridian === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${minute}`;
  }
  const plainMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (plainMatch) {
    return `${plainMatch[1].padStart(2, '0')}:${plainMatch[2]}`;
  }
  return trimmed;
}

export function resetMockCalendar(): void {
  mockBookedSlots.clear();
}
