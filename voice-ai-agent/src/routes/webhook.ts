import { Router, Request, Response } from 'express';
import multer from 'multer';
import { speechToText, textToSpeech } from '../services/voice';
import { runConversationTurn } from '../services/llm';
import { getOrCreateSession } from '../services/session';
import { checkAvailability, bookAppointment } from '../services/calendar';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

/**
 * POST /api/voice/incoming
 * Accepts either:
 *  - multipart/form-data with an "audio" file field (browser mic capture / telephony recording), or
 *  - application/json with a "text" field (for text-only testing / typed chat fallback)
 * Optional "sessionId" and "callerPhone" fields maintain conversation continuity across turns.
 *
 * Pipeline: Audio In -> STT -> Claude LLM (+ tool calls) -> TTS -> Audio Out
 */
router.post('/voice/incoming', upload.single('audio'), async (req: Request, res: Response) => {
  const startTime = Date.now();
  try {
    const sessionId = (req.body?.sessionId as string) || undefined;
    const callerPhone = (req.body?.callerPhone as string) || undefined;
    const session = getOrCreateSession(sessionId, callerPhone);

    let transcript: string;

    if (req.file) {
      transcript = await speechToText(req.file.buffer, {
        encoding: (req.body?.encoding as any) || 'WEBM_OPUS',
        sampleRateHertz: req.body?.sampleRateHertz
          ? parseInt(req.body.sampleRateHertz, 10)
          : undefined,
      });
    } else if (req.body?.text) {
      transcript = String(req.body.text);
    } else {
      return res.status(400).json({ error: 'Provide either an "audio" file or a "text" field.' });
    }

    if (!transcript || !transcript.trim()) {
      return res.status(422).json({
        error: 'Could not understand the audio. Please try speaking again.',
        sessionId: session.sessionId,
      });
    }

    const { reply, toolCalls } = await runConversationTurn(session, transcript);

    let audioBase64 = '';
    let audioMimeType = 'audio/mpeg';
    try {
      const tts = await textToSpeech(reply);
      audioBase64 = tts.audioBase64;
      audioMimeType = tts.mimeType;
    } catch (ttsErr: any) {
      // Still return the text reply even if TTS synthesis fails.
      console.error('TTS synthesis failed:', ttsErr.message || ttsErr);
    }

    const elapsedMs = Date.now() - startTime;

    return res.json({
      sessionId: session.sessionId,
      transcript,
      reply,
      audioBase64,
      audioMimeType,
      toolCalls,
      elapsedMs,
    });
  } catch (err: any) {
    console.error('voice/incoming error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/calendar/check
 * Body: { date: "YYYY-MM-DD", time?: "HH:MM" }
 */
router.post('/calendar/check', async (req: Request, res: Response) => {
  try {
    const { date, time } = req.body || {};
    if (!date) {
      return res.status(400).json({ error: '"date" is required (YYYY-MM-DD).' });
    }
    const slots = await checkAvailability(date, time);
    return res.json({ date, slots });
  } catch (err: any) {
    console.error('calendar/check error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

/**
 * POST /api/calendar/book
 * Body: { client_name, phone_number, date, time, service_type }
 */
router.post('/calendar/book', async (req: Request, res: Response) => {
  try {
    const { client_name, phone_number, date, time, service_type } = req.body || {};
    const missing = ['client_name', 'phone_number', 'date', 'time', 'service_type'].filter(
      (field) => !req.body?.[field]
    );
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const result = await bookAppointment({
      clientName: client_name,
      phoneNumber: phone_number,
      date,
      time,
      serviceType: service_type,
    });

    return res.json(result);
  } catch (err: any) {
    console.error('calendar/book error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

export default router;
