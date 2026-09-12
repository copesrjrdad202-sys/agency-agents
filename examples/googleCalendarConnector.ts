import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import { deleteCalendarEvent, getBusiness, listCalendarEvents, loadCalendarTokens, saveCalendarTokens, upsertCalendarEvent } from './persistentDb';

dotenv.config();

const PORT = process.env.PORT || 3000;
const LEGACY_TOKENS_PATH = path.join(__dirname, 'google_tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

type TokenPayload = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
};

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`;
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in env');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function businessCalendarMode(businessId: string): 'google' | 'mock' {
  const business = getBusiness(businessId);
  const hasGoogleCredentials = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  if (!business || !business.calendar || business.calendar.provider !== 'google' || !hasGoogleCredentials) {
    return 'mock';
  }
  return 'google';
}

function loadLegacyTokens(): TokenPayload | null {
  if (!fs.existsSync(LEGACY_TOKENS_PATH)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(LEGACY_TOKENS_PATH, 'utf8')) as TokenPayload;
  } catch (err) {
    console.error('Failed to read legacy tokens:', err);
    return null;
  }
}

function getStoredTokens(businessId: string): TokenPayload | null {
  const stored = loadCalendarTokens(businessId);
  if (stored) {
    return stored as TokenPayload;
  }
  return loadLegacyTokens();
}

function getOAuthClientForBusiness(businessId: string) {
  const oauth2Client = createOAuth2Client();
  const tokens = getStoredTokens(businessId);
  if (!tokens) {
    throw new Error(`No tokens found for business ${businessId}; complete the OAuth flow first.`);
  }
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

async function listUpcomingEvents(oauth2Client: any, calendarId = 'primary') {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.events.list({
    calendarId,
    timeMin: new Date().toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

async function createEvent(oauth2Client: any, event: any, calendarId = 'primary') {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: 'all',
  });
  return res.data;
}

async function updateEvent(oauth2Client: any, eventId: string, event: any, calendarId = 'primary') {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  const res = await calendar.events.update({
    calendarId,
    eventId,
    requestBody: event,
    sendUpdates: 'all',
  });
  return res.data;
}

async function deleteEvent(oauth2Client: any, eventId: string, calendarId = 'primary') {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  await calendar.events.delete({
    calendarId,
    eventId,
  });
  return { deleted: true, eventId };
}

function mockListEvents(businessId: string, calendarId = 'primary') {
  return listCalendarEvents(businessId, calendarId);
}

function mockCreateEvent(businessId: string, event: any, calendarId = 'primary') {
  const created = upsertCalendarEvent({
    id: event.id || `evt-${Date.now()}`,
    business_id: businessId,
    calendar_id: calendarId,
    summary: event.summary || 'Appointment',
    description: event.description || '',
    start: { dateTime: event.start?.dateTime || event.start || new Date().toISOString() },
    end: { dateTime: event.end?.dateTime || event.end || new Date(Date.now() + 30 * 60000).toISOString() },
    status: event.status === 'cancelled' ? 'cancelled' : 'confirmed',
  });
  return created;
}

function mockUpdateEvent(businessId: string, eventId: string, event: any, calendarId = 'primary') {
  const current = listCalendarEvents(businessId, calendarId).find((item) => item.id === eventId);
  if (!current) {
    throw new Error(`Event not found: ${eventId}`);
  }
  return upsertCalendarEvent({
    ...current,
    ...event,
    id: eventId,
    business_id: businessId,
    calendar_id: calendarId,
    summary: event.summary || current.summary,
    description: event.description !== undefined ? event.description : current.description,
    start: event.start || current.start,
    end: event.end || current.end,
    status: event.status || current.status,
    created_at: current.created_at,
  });
}

function mockDeleteEvent(businessId: string, eventId: string, calendarId = 'primary') {
  const deleted = deleteCalendarEvent(businessId, calendarId, eventId);
  if (!deleted) {
    throw new Error(`Event not found: ${eventId}`);
  }
  return { deleted: true, eventId };
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

app.get('/businesses/:businessId/auth', (_req, res) => {
  try {
    const businessId = _req.params.businessId;
    if (businessCalendarMode(businessId) === 'mock') {
      res.json({ mode: 'mock', authUrl: null, message: 'Mock calendar mode enabled; no Google OAuth required.' });
      return;
    }
    const oauth2Client = createOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });
    res.json({ authUrl: url });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/businesses/:businessId/oauth2callback', async (req, res) => {
  const businessId = req.params.businessId;
  if (businessCalendarMode(businessId) === 'mock') {
    res.send('Mock calendar mode enabled — no OAuth tokens are needed.');
    return;
  }
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).send('Missing code');
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    saveCalendarTokens(businessId, tokens);
    res.send('Authorization successful — tokens saved. You can close this window.');
  } catch (err: any) {
    console.error('OAuth callback error', err);
    res.status(500).send('OAuth error: ' + err.message);
  }
});

app.get('/businesses/:businessId/events', async (req, res) => {
  try {
    const businessId = req.params.businessId;
    const calendarId = (req.query.calendarId as string) || 'primary';
    const events = businessCalendarMode(businessId) === 'mock'
      ? mockListEvents(businessId, calendarId)
      : await listUpcomingEvents(getOAuthClientForBusiness(businessId), calendarId);
    res.json({ events, ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/businesses/:businessId/events', async (req, res) => {
  try {
    const businessId = req.params.businessId;
    const evt = req.body;
    const calendarId = evt.calendarId || 'primary';
    if (!evt || !evt.start || !evt.end) return res.status(400).json({ error: 'Event must include start and end' });
    const created = businessCalendarMode(businessId) === 'mock'
      ? mockCreateEvent(businessId, evt, calendarId)
      : await createEvent(getOAuthClientForBusiness(businessId), evt, calendarId);
    res.json({ created, ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/businesses/:businessId/events/:eventId', async (req, res) => {
  try {
    const businessId = req.params.businessId;
    const evt = req.body;
    const calendarId = evt.calendarId || 'primary';
    const updated = businessCalendarMode(businessId) === 'mock'
      ? mockUpdateEvent(businessId, req.params.eventId, evt, calendarId)
      : await updateEvent(getOAuthClientForBusiness(businessId), req.params.eventId, evt, calendarId);
    res.json({ updated, ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/businesses/:businessId/events/:eventId', async (req, res) => {
  try {
    const businessId = req.params.businessId;
    const calendarId = (req.query.calendarId as string) || 'primary';
    const deleted = businessCalendarMode(businessId) === 'mock'
      ? mockDeleteEvent(businessId, req.params.eventId, calendarId)
      : await deleteEvent(getOAuthClientForBusiness(businessId), req.params.eventId, calendarId);
    res.json({ deleted, ts: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/businesses/:businessId/webhook', (req, res) => {
  console.log('Received webhook:', {
    headers: req.headers,
    body: req.body,
  });
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`Google Calendar connector listening on http://localhost:${PORT}`);
  console.log('Visit /businesses/:businessId/auth to begin OAuth flow.');
});
