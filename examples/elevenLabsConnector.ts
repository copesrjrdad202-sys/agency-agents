import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();

const PORT = Number(process.env.ELEVENLABS_CONNECTOR_PORT || 3901);
const API_KEY = process.env.ELEVENLABS_API_KEY;
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2';
const BASE_URL = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1';

const app = express();
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: false }));

function isLiveMode() {
  return Boolean(API_KEY && API_KEY.trim().length > 0);
}

async function synthesizeSpeech(text: string, voiceId = VOICE_ID, modelId = MODEL_ID) {
  if (!isLiveMode()) {
    return {
      mode: 'mock',
      provider: 'elevenlabs',
      voice_id: voiceId,
      model_id: modelId,
      text,
      generated: false,
      note: 'ELEVENLABS_API_KEY not configured; mock mode active.',
    };
  }

  const url = `${BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': API_KEY || '',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${res.status} ${errorText}`);
  }

  const audio = Buffer.from(await res.arrayBuffer());
  return {
    mode: 'live',
    provider: 'elevenlabs',
    voice_id: voiceId,
    model_id: modelId,
    text,
    generated: true,
    mime_type: res.headers.get('content-type') || 'audio/mpeg',
    audio_b64: audio.toString('base64'),
  };
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    ts: new Date().toISOString(),
    provider: 'elevenlabs',
    mode: isLiveMode() ? 'live' : 'mock',
  });
});

app.post('/voice/tts', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    const voiceId = String(req.body?.voice_id || VOICE_ID);
    const modelId = String(req.body?.model_id || MODEL_ID);
    const payload = await synthesizeSpeech(text, voiceId, modelId);

    if (payload.mode === 'live') {
      const audioBase64 = typeof payload.audio_b64 === 'string' ? payload.audio_b64 : '';
      return res.type('audio/mpeg').send(Buffer.from(audioBase64, 'base64'));
    }

    return res.json({ ...payload, ts: new Date().toISOString() });
  } catch (error: any) {
    console.error('ElevenLabs TTS error:', error?.message || error);
    return res.status(500).json({ error: error?.message || 'Unknown TTS error', ts: new Date().toISOString() });
  }
});

app.post('/voice/session', async (_req, res) => {
  const payload = _req.body || {};
  const businessId = payload.business_id || payload.businessId || 'hvac-plumbing-pro';
  const transcript = String(payload.transcript || payload.text || '').trim();

  res.json({
    status: 'ready',
    provider: 'elevenlabs',
    business_id: businessId,
    mode: isLiveMode() ? 'live' : 'mock',
    transcript,
    requires_handoff: true,
    handoff_target: 'intake-agent',
    ts: new Date().toISOString(),
  });
});

app.post('/voice/transcript', (_req, res) => {
  const payload = _req.body || {};
  res.json({
    status: 'received',
    provider: 'elevenlabs',
    mode: isLiveMode() ? 'live' : 'mock',
    transcript: payload.transcript || payload.text || '',
    business_id: payload.business_id || payload.businessId || 'hvac-plumbing-pro',
    channel: 'phone',
    ts: new Date().toISOString(),
  });
});

app.listen(PORT, () => console.log(`ElevenLabs Connector listening on http://localhost:${PORT}`));
