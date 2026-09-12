import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { google } from 'googleapis';
import { getGoogleCalendarOAuthSettings } from '../src/services/googleCalendarAuth';

async function authorizeCalendar(): Promise<void> {
  const settings = getGoogleCalendarOAuthSettings();
  if (!settings.clientId || !settings.clientSecret) {
    throw new Error(
      'Set GOOGLE_CALENDAR_OAUTH_CLIENT_ID and GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET in .env before authorizing.'
    );
  }

  const redirectUrl = new URL(settings.redirectUri);
  if (redirectUrl.hostname !== '127.0.0.1' && redirectUrl.hostname !== 'localhost') {
    throw new Error('GOOGLE_CALENDAR_OAUTH_REDIRECT_URI must use localhost or 127.0.0.1.');
  }

  const oauth = new google.auth.OAuth2(settings.clientId, settings.clientSecret, settings.redirectUri);
  const state = crypto.randomBytes(32).toString('hex');
  const authorizationUrl = oauth.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [settings.scope],
    state,
  });

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', settings.redirectUri);
    if (requestUrl.pathname !== redirectUrl.pathname) {
      response.writeHead(404).end('Not found');
      return;
    }

    if (requestUrl.searchParams.get('state') !== state) {
      response.writeHead(400).end('Authorization state did not match. Close this window and try again.');
      server.close();
      return;
    }

    const error = requestUrl.searchParams.get('error');
    const code = requestUrl.searchParams.get('code');
    if (error || !code) {
      response.writeHead(400).end(`Google authorization was not completed: ${error || 'no authorization code returned'}.`);
      server.close();
      return;
    }

    try {
      const { tokens } = await oauth.getToken(code);
      if (!tokens.refresh_token) {
        throw new Error('Google did not return a refresh token. Remove this app from your Google Account and try again.');
      }

      fs.mkdirSync(path.dirname(settings.tokenPath), { recursive: true });
      fs.writeFileSync(settings.tokenPath, JSON.stringify({ refresh_token: tokens.refresh_token }, null, 2), {
        encoding: 'utf-8',
        mode: 0o600,
      });
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<h1>Google Calendar connected.</h1><p>You can close this window and return to the terminal.</p>');
      console.log(`Google Calendar authorization saved to ${settings.tokenPath}`);
    } catch (error) {
      response.writeHead(500).end('Authorization failed. Check the terminal for details.');
      console.error(error);
      process.exitCode = 1;
    } finally {
      server.close();
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(Number(redirectUrl.port || '80'), redirectUrl.hostname, () => resolve());
  });
  console.log('Open this URL in a browser and approve calendar access:');
  console.log(authorizationUrl);
}

authorizeCalendar().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
