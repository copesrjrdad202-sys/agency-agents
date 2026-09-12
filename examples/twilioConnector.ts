import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();
const PORT = process.env.TWILIO_CONNECTOR_PORT || 3800;

// Minimal Twilio mock for prototype (in production: call Twilio API)
// Handles incoming SMS/voice and sending outbound messages

interface IncomingMessage {
  id: string;
  from: string;
  to: string;
  channel: 'sms' | 'voice';
  body?: string;
  transcript?: string;
  received_at: string;
  business_id?: string;
}

interface OutgoingMessage {
  id: string;
  to: string;
  channel: 'sms' | 'voice';
  body?: string;
  voice_url?: string;
  sent_at: string;
}

// Mock stores
const incomingMessages: {[id: string]: IncomingMessage} = {};
const outgoingMessages: {[id: string]: OutgoingMessage} = {};

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString(), provider: 'twilio-mock'}));

// Webhook for incoming SMS/voice (Twilio calls this endpoint)
app.post('/webhooks/incoming', (req, res) => {
  const {From, To, Body, CallSid, RecordingUrl} = req.body;
  const isVoice = !!CallSid;

  const id = `msg-${Date.now()}`;
  const incoming: IncomingMessage = {
    id,
    from: From || '',
    to: To || '',
    channel: isVoice ? 'voice' : 'sms',
    body: Body,
    transcript: RecordingUrl ? 'Recording available' : undefined,
    received_at: new Date().toISOString(),
  };

  incomingMessages[id] = incoming;
  console.log(`Incoming ${isVoice ? 'voice' : 'SMS'}: ${From} -> ${To}`);

  // In real system: forward to Intake Agent
  res.json({received: true, message_id: id, ts: new Date().toISOString()});
});

// Send SMS
app.post('/sms/send', (req, res) => {
  const {to, body} = req.body;
  if (!to || !body) return res.status(400).json({error: 'Missing to or body'});

  const id = `sms-${Date.now()}`;
  const msg: OutgoingMessage = {
    id,
    to,
    channel: 'sms',
    body,
    sent_at: new Date().toISOString()
  };

  outgoingMessages[id] = msg;
  console.log(`SMS sent to ${to}: ${body}`);
  res.json({message_id: id, status: 'sent', ts: new Date().toISOString()});
});

// Send voice call (TwiML generation)
app.post('/voice/call', (req, res) => {
  const {to, message} = req.body;
  if (!to || !message) return res.status(400).json({error: 'Missing to or message'});

  const id = `call-${Date.now()}`;
  const msg: OutgoingMessage = {
    id,
    to,
    channel: 'voice',
    body: message,
    sent_at: new Date().toISOString()
  };

  outgoingMessages[id] = msg;
  console.log(`Voice call initiated to ${to}: ${message}`);
  
  // Return minimal TwiML for say/play
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>${message}</Say>
</Response>`;

  res.type('application/xml').send(twiml);
});

// Get incoming message details
app.get('/messages/incoming/:id', (req, res) => {
  const msg = incomingMessages[req.params.id];
  if (!msg) return res.status(404).json({error: 'Message not found'});
  res.json({message: msg, ts: new Date().toISOString()});
});

// List incoming messages (for a business/time range)
app.get('/messages/incoming', (_req, res) => {
  const list = Object.values(incomingMessages);
  res.json({messages: list, count: list.length, ts: new Date().toISOString()});
});

app.listen(PORT, () => console.log(`Twilio Connector (mock) listening on http://localhost:${PORT}`));
