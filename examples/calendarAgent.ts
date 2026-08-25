import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import { deleteCalendarEvent, getBusiness, listCalendarEvents, upsertCalendarEvent } from './persistentDb';

dotenv.config();

const PORT = process.env.CALENDAR_AGENT_PORT || 3401;
const CALENDAR_CONNECTOR = process.env.CALENDAR_CONNECTOR_URL || 'http://localhost:3000';

type CalendarEventInput = {
  id?: string;
  summary?: string;
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  calendarId?: string;
  status?: 'confirmed' | 'cancelled';
};

function getCalendarMode(businessId: string): 'google' | 'mock' {
  const business = getBusiness(businessId);
  if (!business || !business.calendar || business.calendar.provider !== 'google') {
    return 'mock';
  }
  return 'google';
}

function listMockAvailability(businessId: string, calendarId = 'primary') {
  return listCalendarEvents(businessId, calendarId);
}

function createMockEvent(businessId: string, event: CalendarEventInput, calendarId = 'primary') {
  return upsertCalendarEvent({
    id: event.id || `evt-${Date.now()}`,
    business_id: businessId,
    calendar_id: calendarId,
    summary: event.summary || 'Appointment',
    description: event.description || '',
    start: event.start,
    end: event.end,
    status: event.status || 'confirmed',
  });
}

function updateMockEvent(businessId: string, eventId: string, event: Partial<CalendarEventInput>, calendarId = 'primary') {
  const existing = listCalendarEvents(businessId, calendarId).find((item) => item.id === eventId);
  if (!existing) {
    throw new Error(`Event not found: ${eventId}`);
  }
  return upsertCalendarEvent({
    ...existing,
    ...event,
    id: eventId,
    business_id: businessId,
    calendar_id: calendarId,
    summary: event.summary || existing.summary,
    description: event.description !== undefined ? event.description : existing.description,
    start: event.start || existing.start,
    end: event.end || existing.end,
    status: event.status || existing.status,
    created_at: existing.created_at,
  });
}

function deleteMockEvent(businessId: string, eventId: string, calendarId = 'primary') {
  const deleted = deleteCalendarEvent(businessId, calendarId, eventId);
  if (!deleted) {
    throw new Error(`Event not found: ${eventId}`);
  }
  return { deleted: true, eventId };
}

async function getGoogleAvailability(businessId: string, calendarId: string) {
  const response = await axios.get(`${CALENDAR_CONNECTOR}/businesses/${encodeURIComponent(businessId)}/events`, {
    params: { calendarId },
  });
  return response.data.events || [];
}

async function bookGoogleEvent(businessId: string, event: CalendarEventInput) {
  const response = await axios.post(`${CALENDAR_CONNECTOR}/businesses/${encodeURIComponent(businessId)}/events`, event);
  return response.data.created;
}

async function updateGoogleEvent(businessId: string, eventId: string, event: CalendarEventInput) {
  const response = await axios.put(`${CALENDAR_CONNECTOR}/businesses/${encodeURIComponent(businessId)}/events/${encodeURIComponent(eventId)}`, event);
  return response.data.updated;
}

async function cancelGoogleEvent(businessId: string, eventId: string, calendarId: string) {
  const response = await axios.delete(`${CALENDAR_CONNECTOR}/businesses/${encodeURIComponent(businessId)}/events/${encodeURIComponent(eventId)}`, {
    params: { calendarId },
  });
  return response.data.deleted;
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.get('/businesses/:businessId/availability', async (req, res) => {
  try {
    const { businessId } = req.params;
    const calendarId = (req.query.calendarId as string) || 'primary';
    const mode = getCalendarMode(businessId);
    const availability = mode === 'mock'
      ? listMockAvailability(businessId, calendarId)
      : await getGoogleAvailability(businessId, calendarId);
    res.json({ businessId, calendarMode: mode, availability, ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/businesses/:businessId/book', async (req, res) => {
  try {
    const { businessId } = req.params;
    const event = req.body as CalendarEventInput;
    const calendarId = event.calendarId || 'primary';
    if (!event || !event.start || !event.end) {
      return res.status(400).json({ error: 'Event must include start and end' });
    }
    const mode = getCalendarMode(businessId);
    const created = mode === 'mock'
      ? createMockEvent(businessId, event, calendarId)
      : await bookGoogleEvent(businessId, event);
    res.json({ businessId, calendarMode: mode, action: 'booked', created, ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/businesses/:businessId/update/:eventId', async (req, res) => {
  try {
    const { businessId, eventId } = req.params;
    const event = req.body as Partial<CalendarEventInput>;
    const calendarId = event.calendarId || 'primary';
    const mode = getCalendarMode(businessId);
    const updated = mode === 'mock'
      ? updateMockEvent(businessId, eventId, event, calendarId)
      : await updateGoogleEvent(businessId, eventId, event as CalendarEventInput);
    res.json({ businessId, calendarMode: mode, action: 'updated', updated, ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/businesses/:businessId/cancel/:eventId', async (req, res) => {
  try {
    const { businessId, eventId } = req.params;
    const calendarId = (req.query.calendarId as string) || 'primary';
    const mode = getCalendarMode(businessId);
    const cancelled = mode === 'mock'
      ? deleteMockEvent(businessId, eventId, calendarId)
      : await cancelGoogleEvent(businessId, eventId, calendarId);
    res.json({ businessId, calendarMode: mode, action: 'cancelled', cancelled, ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`Calendar Agent listening on http://localhost:${PORT}`));
