import { Router, Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import { randomUUID } from 'crypto';
import { textToSpeech } from '../services/voice';
import { runConversationTurn } from '../services/llm';
import { getOrCreateSession } from '../services/session';
import { resolveBusinessForNumber } from '../services/businessStore';
import { config } from '../config';

/**
 * Twilio telephony layer.
 *
 * Design: each customer forwards their existing business number (on
 * no-answer/busy) to a cheap Twilio-provisioned number. That Twilio number's
 * "A call comes in" webhook points at POST /api/twilio/voice. We use Twilio's
 * own <Gather input="speech"> to capture caller speech (SpeechResult) rather
 * than uploading raw audio through Google STT — this keeps the phone loop
 * simple and reliable and avoids needing to handle Twilio's proprietary
 * recording formats. Claude's reply is synthesized with Google TTS and served
 * back to Twilio via a short-lived, in-memory audio URL that <Play> can fetch.
 */

const router = Router();

// Short-lived in-memory audio cache so Twilio's <Play> (which requires a
// fetchable URL, not inline audio) can retrieve synthesized speech.
interface CachedAudio {
  buffer: Buffer;
  mimeType: string;
  expiresAt: number;
}
const audioCache = new Map<string, CachedAudio>();
const AUDIO_TTL_MS = 5 * 60 * 1000;

function cacheAudio(base64: string, mimeType: string): string {
  const id = randomUUID();
  audioCache.set(id, {
    buffer: Buffer.from(base64, 'base64'),
    mimeType,
    expiresAt: Date.now() + AUDIO_TTL_MS,
  });
  return id;
}

function sweepExpiredAudio(): void {
  const now = Date.now();
  for (const [id, entry] of audioCache.entries()) {
    if (entry.expiresAt < now) audioCache.delete(id);
  }
}

router.get('/twilio/audio/:id', (req: Request, res: Response) => {
  sweepExpiredAudio();
  const entry = audioCache.get(req.params.id);
  if (!entry) {
    return res.status(404).send('Not found');
  }
  res.set('Content-Type', entry.mimeType);
  return res.send(entry.buffer);
});

/**
 * Validates the X-Twilio-Signature header on every /api/twilio/voice and
 * /api/twilio/gather request. Disable only for local testing without a real
 * Twilio account via TWILIO_VALIDATE_SIGNATURE=false.
 */
export function validateTwilioSignature(req: Request, res: Response, next: NextFunction): void {
  if (!config.twilio.validateSignature) {
    return next();
  }
  if (!config.twilio.authToken) {
    console.warn('TWILIO_AUTH_TOKEN not set — rejecting Twilio webhook request.');
    res.status(500).send('Server misconfigured: missing TWILIO_AUTH_TOKEN');
    return;
  }

  const signature = req.header('X-Twilio-Signature') || '';
  const publicBase = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
  const fullUrl = `${publicBase}${req.originalUrl}`;

  const valid = twilio.validateRequest(config.twilio.authToken, signature, fullUrl, req.body);
  if (!valid) {
    console.warn('Rejected Twilio webhook: invalid signature.');
    res.status(403).send('Invalid Twilio signature');
    return;
  }
  next();
}

function greetingTwiml(business: ReturnType<typeof resolveBusinessForNumber>, gatherAction: string): string {
  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: ['speech'],
    action: gatherAction,
    method: 'POST',
    speechTimeout: 'auto',
    speechModel: 'phone_call',
  });
  gather.say(
    { voice: 'Polly.Joanna' },
    `Thanks for calling ${business.name}. How can I help you today?`
  );
  // If the caller says nothing, re-prompt instead of silently hanging up.
  twiml.redirect({ method: 'POST' }, gatherAction.replace('/gather', '/voice'));
  return twiml.toString();
}

/**
 * POST /api/twilio/voice
 * Twilio's "A call comes in" webhook. Looks up the business by the dialed
 * ("To") number and greets the caller, then gathers their speech.
 */
router.post('/twilio/voice', validateTwilioSignature, (req: Request, res: Response) => {
  const toNumber = (req.body?.To as string) || '';
  const business = resolveBusinessForNumber(toNumber);

  const gatherAction = '/api/twilio/gather';
  res.set('Content-Type', 'text/xml');
  return res.send(greetingTwiml(business, gatherAction));
});

/**
 * POST /api/twilio/gather
 * Receives the caller's speech transcription from <Gather input="speech">,
 * runs it through Claude (+ tool calls), synthesizes the reply, and either
 * loops with another <Gather> or hangs up.
 */
router.post('/twilio/gather', validateTwilioSignature, async (req: Request, res: Response) => {
  const toNumber = (req.body?.To as string) || '';
  const callSid = (req.body?.CallSid as string) || randomUUID();
  const callerPhone = (req.body?.From as string) || undefined;
  const speechResult = (req.body?.SpeechResult as string) || '';

  const business = resolveBusinessForNumber(toNumber);
  const twiml = new twilio.twiml.VoiceResponse();

  try {
    if (!speechResult.trim()) {
      const gather = twiml.gather({
        input: ['speech'],
        action: '/api/twilio/gather',
        method: 'POST',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
      });
      gather.say({ voice: 'Polly.Joanna' }, "Sorry, I didn't catch that. Could you say that again?");
      res.set('Content-Type', 'text/xml');
      return res.send(twiml.toString());
    }

    const session = getOrCreateSession(callSid, callerPhone);
    const { reply } = await runConversationTurn(session, speechResult, business);

    let played = false;
    try {
      const tts = await textToSpeech(reply, {
        voiceName: business.voiceName,
        languageCode: business.languageCode,
        audioEncoding: 'MP3',
      });
      const audioId = cacheAudio(tts.audioBase64, tts.mimeType);
      const publicBase = config.publicBaseUrl || `${req.protocol}://${req.get('host')}`;
      twiml.play(`${publicBase}/api/twilio/audio/${audioId}`);
      played = true;
    } catch (ttsErr: any) {
      console.error('Twilio TTS synthesis failed, falling back to <Say>:', ttsErr.message || ttsErr);
    }

    if (!played) {
      twiml.say({ voice: 'Polly.Joanna' }, reply);
    }

    const conversationEnded = /goodbye|have a great day|talk soon|see you/i.test(reply) &&
      /confirm|booked|appointment|escalat/i.test(reply);

    if (conversationEnded) {
      twiml.hangup();
    } else {
      const gather = twiml.gather({
        input: ['speech'],
        action: '/api/twilio/gather',
        method: 'POST',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
      });
      gather.pause({ length: 1 });
      // Re-prompt with silence handling if the caller doesn't respond.
      twiml.redirect({ method: 'POST' }, '/api/twilio/gather');
    }

    res.set('Content-Type', 'text/xml');
    return res.send(twiml.toString());
  } catch (err: any) {
    console.error('twilio/gather error:', err);
    const errorTwiml = new twilio.twiml.VoiceResponse();
    errorTwiml.say(
      { voice: 'Polly.Joanna' },
      'Sorry, something went wrong on our end. Please try calling back in a moment.'
    );
    errorTwiml.hangup();
    res.set('Content-Type', 'text/xml');
    return res.status(200).send(errorTwiml.toString());
  }
});

export default router;
