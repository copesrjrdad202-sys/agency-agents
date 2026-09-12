import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { config } from '../config';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

function getOAuthTokenPath(): string {
  return path.resolve(config.dataDir, 'google-calendar-oauth-token.json');
}

export function getGoogleCalendarAuth() {
  if (!config.calendar.googleOAuthClientId && !config.calendar.googleOAuthClientSecret) {
    return new google.auth.GoogleAuth({ scopes: [CALENDAR_SCOPE] });
  }

  if (!config.calendar.googleOAuthClientId || !config.calendar.googleOAuthClientSecret) {
    throw new Error(
      'Google Calendar OAuth requires both GOOGLE_CALENDAR_OAUTH_CLIENT_ID and GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET.'
    );
  }

  const tokenPath = getOAuthTokenPath();
  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `Google Calendar OAuth has not been authorized. Run "npm run authorize:calendar" on this machine to create ${tokenPath}.`
    );
  }

  let credentials: { refresh_token?: string };
  try {
    credentials = JSON.parse(fs.readFileSync(tokenPath, 'utf-8')) as { refresh_token?: string };
  } catch (error) {
    throw new Error(
      `Google Calendar OAuth token at ${tokenPath} could not be read: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!credentials.refresh_token) {
    throw new Error(`Google Calendar OAuth token at ${tokenPath} does not contain a refresh token.`);
  }

  const auth = new google.auth.OAuth2(
    config.calendar.googleOAuthClientId,
    config.calendar.googleOAuthClientSecret,
    config.calendar.googleOAuthRedirectUri
  );
  auth.setCredentials(credentials);
  return auth;
}

export function getGoogleCalendarOAuthSettings() {
  return {
    clientId: config.calendar.googleOAuthClientId,
    clientSecret: config.calendar.googleOAuthClientSecret,
    redirectUri: config.calendar.googleOAuthRedirectUri,
    tokenPath: getOAuthTokenPath(),
    scope: CALENDAR_SCOPE,
  };
}
