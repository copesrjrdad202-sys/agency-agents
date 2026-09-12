import twilio, { Twilio } from 'twilio';
import { config } from '../config';

/**
 * Builds a Twilio REST client for outbound API calls (buying numbers, updating
 * webhooks, etc.). Prefers API Key/Secret (revocable independently of the
 * account's main Auth Token) and falls back to Account SID + Auth Token if no
 * API Key is configured. Note: signature validation on inbound webhooks always
 * uses the Auth Token directly (see routes/twilio.ts) — Twilio does not support
 * validating request signatures with API Key/Secret.
 */
export function getTwilioClient(): Twilio {
  const { accountSid, authToken, apiKeySid, apiKeySecret } = config.twilio;

  if (!accountSid) {
    throw new Error('TWILIO_ACCOUNT_SID is not set.');
  }

  if (apiKeySid && apiKeySecret) {
    return twilio(apiKeySid, apiKeySecret, { accountSid });
  }

  if (!authToken) {
    throw new Error(
      'Set either TWILIO_API_KEY_SID + TWILIO_API_KEY_SECRET, or TWILIO_AUTH_TOKEN, in your .env file.'
    );
  }

  return twilio(accountSid, authToken);
}
