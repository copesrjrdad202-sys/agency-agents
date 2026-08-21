import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {google} from 'googleapis';

dotenv.config();

const PORT = process.env.PORT || 3000;
const TOKENS_PATH = path.join(__dirname, 'google_tokens.json');

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`;
  if (!clientId || !clientSecret) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in env');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function saveTokens(tokens: any) {
  fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2), {encoding: 'utf8'});
}

function loadTokens(): any | null {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to read tokens:', err);
    return null;
  }
}

async function ensureAuthenticated(oauth2Client: any) {
  const tokens = loadTokens();
  if (tokens) {
    oauth2Client.setCredentials(tokens);
    // googleapis library automatically refreshes if needed when making requests
    return oauth2Client;
  }
  throw new Error('No tokens found; complete the OAuth flow at /auth');
}

async function listUpcomingEvents(oauth2Client: any, calendarId = 'primary') {
  const calendar = google.calendar({version: 'v3', auth: oauth2Client});
  const res = await calendar.events.list({
    calendarId,
    timeMin: (new Date()).toISOString(),
    maxResults: 10,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return res.data.items || [];
}

async function createEvent(oauth2Client: any, event: any, calendarId = 'primary') {
  const calendar = google.calendar({version: 'v3', auth: oauth2Client});
  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
    sendUpdates: 'all'
  });
  return res.data;
}

// Minimal Express server exposing helper endpoints for manual testing & webhook handling
const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

app.get('/auth', (_req, res) => {
  try {
    const oauth2Client = createOAuth2Client();
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent'
    });
    res.json({authUrl: url});
  } catch (err: any) {
    res.status(500).json({error: err.message});
  }
});

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) return res.status(400).send('Missing code');
  try {
    const oauth2Client = createOAuth2Client();
    const {tokens} = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    saveTokens(tokens);
    res.send('Authorization successful — tokens saved. You can close this window.');
  } catch (err: any) {
    console.error('OAuth callback error', err);
    res.status(500).send('OAuth error: ' + err.message);
  }
});

// List events (requires prior /auth flow)
app.get('/events', async (_req, res) => {
  try {
    const oauth2Client = createOAuth2Client();
    await ensureAuthenticated(oauth2Client);
    const events = await listUpcomingEvents(oauth2Client);
    res.json({events, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(500).json({error: err.message});
  }
});

// Create a simple event (expects JSON body with start/end/summary/description)
app.post('/events', async (req, res) => {
  try {
    const oauth2Client = createOAuth2Client();
    await ensureAuthenticated(oauth2Client);
    const evt = req.body;
    if (!evt || !evt.start || !evt.end) return res.status(400).json({error: 'Event must include start and end'});
    const created = await createEvent(oauth2Client, evt);
    res.json({created, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(500).json({error: err.message});
  }
});

// Webhook receiver for calendar push notifications
app.post('/webhook', (req, res) => {
  // Google Calendar push notifications send headers like X-Goog-Channel-ID etc.
  console.log('Received webhook:', {
    headers: req.headers,
    body: req.body
  });
  // In a real system, validate the channel token and process the change to sync local state.
  res.status(200).send('OK');
});

app.listen(PORT, () => {
  console.log(`Google Calendar connector listening on http://localhost:${PORT}`);
  console.log(`Visit /auth to begin OAuth flow. Tokens saved to ${TOKENS_PATH}`);
});
