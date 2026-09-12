import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

function resolveGoogleCredentials(): string | undefined {
  const filePath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (filePath && fs.existsSync(path.resolve(filePath))) {
    return path.resolve(filePath);
  }

  const base64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_BASE64;
  if (base64) {
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');
    const tmpPath = path.join(__dirname, '..', '..', 'google-credentials.generated.json');
    fs.writeFileSync(tmpPath, decoded, 'utf-8');
    return tmpPath;
  }

  return undefined;
}

export const config = {
  port: parseInt(process.env.PORT || '3950', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  dataDir: process.env.DATA_DIR || './data',

  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  claudeModel: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',

  googleCredentialsPath: resolveGoogleCredentials(),
  googleProjectId: process.env.GOOGLE_PROJECT_ID || '',

  tts: {
    voiceName: process.env.TTS_VOICE_NAME || 'en-US-Neural2-F',
    languageCode: process.env.TTS_LANGUAGE_CODE || 'en-US',
  },
  stt: {
    languageCode: process.env.STT_LANGUAGE_CODE || 'en-US',
  },

  business: {
    name: process.env.BUSINESS_NAME || 'Acme Home Services',
    type: process.env.BUSINESS_TYPE || 'Home Services',
    hours: process.env.BUSINESS_HOURS || 'Mon-Fri 8am-6pm',
    serviceArea: process.env.BUSINESS_SERVICE_AREA || 'the local area',
  },

  calendar: {
    provider: (process.env.CALENDAR_PROVIDER || 'mock') as 'mock' | 'google' | 'multi-agent',
    googleCalendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    // OAuth is an alternative to a service-account key for Google Calendar access.
    // It authorizes one Google user's calendar and persists only a refresh token.
    googleOAuthClientId: process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_ID || '',
    googleOAuthClientSecret: process.env.GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET || '',
    googleOAuthRedirectUri:
      process.env.GOOGLE_CALENDAR_OAUTH_REDIRECT_URI || 'http://127.0.0.1:53682/oauth2callback',
    // Multi-agent automation system integration (see ../examples/calendarAgent.ts)
    multiAgentCalendarUrl: process.env.MULTI_AGENT_CALENDAR_URL || 'http://localhost:3401',
    multiAgentBusinessId: process.env.MULTI_AGENT_BUSINESS_ID || 'default',
    multiAgentAutomationUrl: process.env.MULTI_AGENT_AUTOMATION_URL || '',
  },

  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    // Auth Token is required for webhook signature validation (X-Twilio-Signature) —
    // Twilio does not support validating signatures with API Key/Secret.
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    // API Key/Secret (recommended, revocable independent of the Auth Token) used for
    // outbound Twilio API calls such as buying/configuring phone numbers. Falls back
    // to Account SID + Auth Token if not set.
    apiKeySid: process.env.TWILIO_API_KEY_SID || '',
    apiKeySecret: process.env.TWILIO_API_KEY_SECRET || '',
    // When true, incoming webhook signatures are validated against TWILIO_AUTH_TOKEN.
    // Only disable for local testing without a real Twilio account.
    validateSignature: (process.env.TWILIO_VALIDATE_SIGNATURE || 'true') === 'true',
  },

  adminApiKey: process.env.ADMIN_API_KEY || '',

  automationWebhookUrl: process.env.AUTOMATION_WEBHOOK_URL || '',
};

if (config.googleCredentialsPath) {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = config.googleCredentialsPath;
}
