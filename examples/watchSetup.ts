import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import {google} from 'googleapis';

dotenv.config();
const TOKENS_PATH = path.join(__dirname, 'google_tokens.json');
const PORT = process.env.PORT || 3000;

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/oauth2callback`;
  if (!clientId || !clientSecret) throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in env');
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function loadTokens(): any | null {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8')); } catch (err) { console.error('Failed to read tokens:', err); return null; }
}

async function createWatch(calendarId = 'primary') {
  const tokens = loadTokens();
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
