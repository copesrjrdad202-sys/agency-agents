import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const PORT = process.env.INTAKE_AGENT_PORT || 3300;
const AUTOMATION_URL = process.env.AUTOMATION_AGENT_URL || 'http://localhost:3200/process';

const app = express();
app.use(bodyParser.json());

// Simulated intake endpoint: receives raw call/message and extracts structured intent
app.post('/intake', async (req, res) => {
  const {business_id, channel, caller, text, voice_transcript, metadata} = req.body;

  // Very small heuristic parser for prototype
  const lowered = (text || voice_transcript || '').toLowerCase();
  let intent: any = {type: 'unknown', payload: {}};

  if (/book|appointment|schedule/.test(lowered)) {
    intent.type = 'book';
    // naive extraction: look for service names or times in text (prototype)
    intent.payload = {requested_time: metadata?.requested_time || null, service_id: metadata?.service_id || null};
  } else if (/invoice|bill|charge|pay/.test(lowered)) {
    intent.type = 'invoice';
    intent.payload = {amount_cents: metadata?.amount_cents || null, description: metadata?.description || null};
  } else if (/cancel|reschedule|change/.test(lowered)) {
    intent.type = 'modify_booking';
    intent.payload = {target_event_id: metadata?.target_event_id || null};
  } else {
    intent.type = 'question';
    intent.payload = {text: text || voice_transcript};
  }

  const structured = {
    ts: new Date().toISOString(),
    business_id,
    channel,
    caller,
    intent,
    source: 'intake-agent',
  };

  // Forward to Automation Agent for decisioning
  try {
    const resp = await axios.post(AUTOMATION_URL, structured, {timeout: 5000});
    return res.json({status: 'forwarded', automation_response: resp.data, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('Failed forwarding to Automation Agent', err?.message || err);
    return res.status(502).json({status: 'failed', error: err?.message || String(err)});
  }
});

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

app.listen(PORT, () => console.log(`Intake Agent listening on http://localhost:${PORT}`));
