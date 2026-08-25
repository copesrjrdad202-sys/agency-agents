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
  console.error('Error: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER not set in environment.');
  console.error('Get Twilio credentials from https://www.twilio.com/console');
  process.exit(1);
}

const client = twilio(ACCOUNT_SID, AUTH_TOKEN);

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString(), provider: 'twilio-live'}));

// Send SMS
app.post(['/sms/send', '/twilio/sms/send'], async (req, res) => {
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

// Incoming voice call webhook (Twilio calls this URL when call is received)
app.post(['/webhooks/voice', '/twilio/webhooks/voice'], (req, res) => {
  const {From, To, CallSid} = req.body;
  console.log(`Incoming voice call from ${From} to ${To} (SID: ${CallSid})`);
  
  // In production: forward to Intake Agent with call recording
  // For now, just answer and say thank you
  const twiml = new twilio.twiml.VoiceResponse();
  twiml.say('Thank you for calling. Your call has been received.');
  res.type('text/xml').send(twiml.toString());
});

// Get message status
app.get(['/messages/:sid', '/twilio/messages/:sid'], async (req, res) => {
  try {
    const message = await client.messages(req.params.sid).fetch();
    res.json({message, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(404).json({error: 'Message not found'});
  }
});

// Get call status
app.get(['/calls/:sid', '/twilio/calls/:sid'], async (req, res) => {
  try {
    const call = await client.calls(req.params.sid).fetch();
    res.json({call, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(404).json({error: 'Call not found'});
  }
});

app.listen(PORT, () => console.log(`Twilio Connector (live API) listening on http://localhost:${PORT}`));
