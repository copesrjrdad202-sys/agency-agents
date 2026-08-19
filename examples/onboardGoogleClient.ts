import express from 'express';
import open from 'open';
import {google} from 'googleapis';
import fs from 'fs';
import path from 'path';

// Usage:
// 1) node onboardGoogleClient.js <businessId> <GOOGLE_CLIENT_ID> <GOOGLE_CLIENT_SECRET> [PORT]
// 2) Follow printed URL in browser. After consent, tokens saved to examples/tokens-<businessId>.json

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: node onboardGoogleClient.js <businessId> <GOOGLE_CLIENT_ID> <GOOGLE_CLIENT_SECRET> [PORT]');
  process.exit(2);
}

const [businessId, CLIENT_ID, CLIENT_SECRET] = args;
const PORT = parseInt(args[3] || '3005', 10);
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const TOKENS_OUTPUT = path.join(__dirname, `tokens-${businessId}.json`);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const app = express();

app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).send('Missing code in callback');
    return;
  }
  try {
    const {tokens} = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    fs.writeFileSync(TOKENS_OUTPUT, JSON.stringify({client_id: CLIENT_ID, client_secret: CLIENT_SECRET, redirect_uri: REDIRECT_URI, tokens}, null, 2));
    console.log(`Tokens saved to ${TOKENS_OUTPUT}`);
    res.send(`Authorization complete. Tokens saved to ${TOKENS_OUTPUT}. You may close this window.`);
    setTimeout(() => process.exit(0), 1000);
  } catch (err: any) {
    console.error('Error exchanging code for token', err);
    res.status(500).send('Token exchange failed: ' + err.message);
  }
});

app.listen(PORT, async () => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  console.log('Open this URL in your browser to authorize the calendar for business:', authUrl);
  console.log('If you have a browser available locally, the script will try to open it automatically.');
  try { await open(authUrl); } catch (_) { /* ignore */ }
  console.log(`Listening for OAuth callback on http://localhost:${PORT}/oauth2callback`);
});
