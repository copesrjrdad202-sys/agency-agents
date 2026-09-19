import express from 'express';
import bodyParser from 'body-parser';
import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();
const PORT = process.env.TWILIO_CONNECTOR_PORT || 3800;
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;

if (!ACCOUNT_SID || !AUTH_TOKEN || !TWILIO_PHONE) {
  console.warn('Warning: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER not set.');
  console.warn('Twilio routes will return deferred responses until configured. Get credentials from https://www.twilio.com/console');
}

const client = (ACCOUNT_SID && AUTH_TOKEN) ? twilio(ACCOUNT_SID, AUTH_TOKEN) : null;

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  ts: new Date().toISOString(),
  provider: 'twilio-live',
  configured: Boolean(client && TWILIO_PHONE),
}));

// Send SMS
app.post(['/sms/send', '/twilio/sms/send'], async (req, res) => {
  if (!client || !TWILIO_PHONE) {
    return res.status(503).json({status: 'deferred', error: 'Twilio credentials not configured', ts: new Date().toISOString()});
  }
  try {
    const {to, body} = req.body;
    if (!to || !body) return res.status(400).json({error: 'Missing to or body'});

    const message = await client.messages.create({
      from: TWILIO_PHONE,
      to,
      body
    });

    console.log(`SMS sent to ${to}: SID ${message.sid}`);
    res.json({message_sid: message.sid, status: message.status, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('SMS send failed:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Send voice call with TwiML
app.post(['/voice/call', '/twilio/voice/call'], async (req, res) => {
  if (!client || !TWILIO_PHONE) {
    return res.status(503).json({status: 'deferred', error: 'Twilio credentials not configured', ts: new Date().toISOString()});
  }
  try {
    const {to, message} = req.body;
    if (!to || !message) return res.status(400).json({error: 'Missing to or message'});

    const call = await client.calls.create({
      from: TWILIO_PHONE,
      to,
      twiml: `<Response><Say>${message}</Say></Response>`
    });

    console.log(`Voice call initiated to ${to}: SID ${call.sid}`);
    res.json({call_sid: call.sid, status: call.status, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('Voice call failed:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Incoming SMS webhook (Twilio calls this URL when SMS is received)
app.post(['/webhooks/sms', '/twilio/webhooks/sms'], (req, res) => {
  const {From, To, Body, MessageSid} = req.body;
  console.log(`Incoming SMS from ${From}: ${Body} (SID: ${MessageSid})`);
  
  // In production: forward to Intake Agent
  // For now, just acknowledge receipt
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message('Message received. Thank you!');
  res.type('text/xml').send(twiml.toString());
});

const BUSINESS_CONTEXT_URL = process.env.BUSINESS_CONTEXT_URL || 'http://127.0.0.1:3100';
const INTAKE_AGENT_URL = process.env.INTAKE_AGENT_URL || 'http://127.0.0.1:3300';
const DEFAULT_BUSINESS_ID = process.env.DEFAULT_BUSINESS_ID || 'pilot-copejoseph75';

function normalizePhone(value: string | undefined | null): string {
  return (value || '').replace(/[^\d]/g, '');
}

async function resolveBusiness(toNumber: string | undefined): Promise<any> {
  try {
    const resp = await fetch(`${BUSINESS_CONTEXT_URL}/businesses`);
    if (!resp.ok) throw new Error(`business-context returned ${resp.status}`);
    const data: any = await resp.json();
    const businesses: any[] = data.businesses || [];
    const target = normalizePhone(toNumber);
    const match = target ? businesses.find((b) => normalizePhone(b.contact?.phone) === target) : null;
    return match || businesses.find((b) => b.id === DEFAULT_BUSINESS_ID) || businesses[0] || null;
  } catch (err: any) {
    console.warn('Failed to resolve business for incoming call:', err?.message || err);
    return null;
  }
}

function gatherPath(): string {
  return '/webhooks/voice/gather';
}

// Incoming voice call webhook (Twilio calls this URL when call is received)
app.post(['/webhooks/voice', '/twilio/webhooks/voice'], async (req, res) => {
  const {From, To, CallSid} = req.body;
  console.log(`Incoming voice call from ${From} to ${To} (SID: ${CallSid})`);

  const business = await resolveBusiness(To);
  const greeting = business?.branding?.greeting
    || `Thank you for calling ${business?.branding?.displayName || business?.name || 'us'}. How can we help you today?`;

  const twiml = new twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: ['speech'],
    action: gatherPath(),
    method: 'POST',
    speechTimeout: 'auto',
    timeout: 6,
  });
  gather.say(greeting);
  // If no speech is detected at all, Twilio falls through here.
  twiml.say("We didn't hear anything. Please call back when you're ready. Goodbye.");
  twiml.hangup();

  res.type('text/xml').send(twiml.toString());
});

// Follow-up turn in the conversation: caller's speech has been transcribed by Twilio.
app.post(['/webhooks/voice/gather', '/twilio/webhooks/voice/gather'], async (req, res) => {
  const {From, To, CallSid, SpeechResult} = req.body;
  const twiml = new twilio.twiml.VoiceResponse();

  if (!SpeechResult || !SpeechResult.trim()) {
    twiml.say("Sorry, I didn't catch that. Please call back when you're ready. Goodbye.");
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  const business = await resolveBusiness(To);
  const businessId = business?.id || DEFAULT_BUSINESS_ID;

  let spokenReply = "I'm sorry, I had trouble processing that. Let me connect you with our team.";
  let shouldContinue = true;

  try {
    const intakeResp = await fetch(`${INTAKE_AGENT_URL}/intake`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        business_id: businessId,
        channel: 'voice',
        caller: From,
        text: SpeechResult,
        metadata: {call_sid: CallSid},
      }),
    });
    const intakeData: any = await intakeResp.json();
    const automationResponse = intakeData?.automation_response;
    const action = automationResponse?.action;

    if (action === 'booked') {
      spokenReply = "You're all set. We've booked your appointment and you'll receive a confirmation shortly. Is there anything else I can help with?";
    } else if (action === 'cancelled') {
      spokenReply = 'Your appointment has been cancelled. Is there anything else I can help with?';
    } else if (action === 'updated') {
      spokenReply = 'Your appointment has been updated. Is there anything else I can help with?';
    } else if (action === 'answer') {
      spokenReply = `${automationResponse.answer} Is there anything else I can help with?`;
    } else if (action === 'error') {
      spokenReply = "I'm sorry, something went wrong on our end handling that request. Let me connect you with our team.";
      shouldContinue = false;
    } else {
      spokenReply = "I want to make sure I get this right for you. Could you tell me more about what you need?";
    }
  } catch (err: any) {
    console.warn('Voice conversation: intake forwarding failed', err?.message || err);
  }

  if (shouldContinue) {
    const gather = twiml.gather({
      input: ['speech'],
      action: gatherPath(),
      method: 'POST',
      speechTimeout: 'auto',
      timeout: 6,
    });
    gather.say(spokenReply);
    twiml.say('Thanks for calling. Goodbye.');
    twiml.hangup();
  } else {
    twiml.say(spokenReply);
    twiml.hangup();
  }

  res.type('text/xml').send(twiml.toString());
});

// Get message status
app.get(['/messages/:sid', '/twilio/messages/:sid'], async (req, res) => {
  if (!client) {
    return res.status(503).json({status: 'deferred', error: 'Twilio credentials not configured', ts: new Date().toISOString()});
  }
  try {
    const message = await client.messages(req.params.sid).fetch();
    res.json({message, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(404).json({error: 'Message not found'});
  }
});

// Get call status
app.get(['/calls/:sid', '/twilio/calls/:sid'], async (req, res) => {
  if (!client) {
    return res.status(503).json({status: 'deferred', error: 'Twilio credentials not configured', ts: new Date().toISOString()});
  }
  try {
    const call = await client.calls(req.params.sid).fetch();
    res.json({call, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(404).json({error: 'Call not found'});
  }
});

app.listen(PORT, () => console.log(`Twilio Connector (live API) listening on http://localhost:${PORT}`));
