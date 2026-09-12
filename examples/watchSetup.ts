import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {google} from 'googleapis';
import { loadCalendarTokens } from './persistentDb';

dotenv.config();
const PORT = process.env.PORT || 3000;
const LEGACY_TOKENS_PATH = path.join(__dirname, 'google_tokens.json');

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`;
  if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in env');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function loadTokens(businessId?: string): any | null {
  if (businessId) {
    const dbTokens = loadCalendarTokens(businessId);
    if (dbTokens) return dbTokens;
  }
  if (fs.existsSync(LEGACY_TOKENS_PATH)) {
    try { return JSON.parse(fs.readFileSync(LEGACY_TOKENS_PATH, 'utf8')); } catch (err) { console.error('Failed to read tokens:', err); return null; }
  }
  return null;
}

async function createWatch(calendarId = 'primary') {
  const businessId = process.env.BUSINESS_ID;
  const tokens = loadTokens(businessId);
  if (!tokens) throw new Error('No tokens found. Complete OAuth flow at /auth first.');
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(tokens);
  const calendar = google.calendar({version: 'v3', auth: oauth2Client});

  const channelId = `chan-${Date.now()}`;
  const webhookUrl = process.env.CALENDAR_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('Set CALENDAR_WEBHOOK_URL in env to the public webhook URL (e.g., https://myhost.example/webhook)');

  const resource = {
    id: channelId,
    type: 'web_hook',
    address: webhookUrl
  } as any;

  const resp = await calendar.events.watch({calendarId, requestBody: resource});
  return resp.data;
}

(async () => {
  try {
    console.log('Creating watch subscription...');
    const result = await createWatch(process.env.GOOGLE_CALENDAR_ID || 'primary');
    console.log('Watch created:', JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error('Failed to create watch:', err.message || err);
    process.exit(1);
  }
})();
