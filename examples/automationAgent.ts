import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const PORT = process.env.AUTOMATION_AGENT_PORT || 3200;
const BUSINESS_CONTEXT = process.env.BUSINESS_CONTEXT_URL || 'http://localhost:3100/businesses';
const CALENDAR_CONNECTOR_BASE = process.env.CALENDAR_CONNECTOR_URL || 'http://localhost:3000';

const app = express();
app.use(bodyParser.json());

app.post('/process', async (req, res) => {
  const payload = req.body;
  const {business_id, intent} = payload;
  const logEntry = {ts: new Date().toISOString(), business_id, intent};
  console.log('AutomationAgent received:', JSON.stringify(logEntry));

  // Load business profile
  let business: any = null;
  try {
    const bresp = await axios.get(`${BUSINESS_CONTEXT}/${encodeURIComponent(business_id)}`);
    business = bresp.data.business;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('Failed to load business profile', message);
  }

  // Decision logic (prototype)
  if (intent.type === 'book') {
    // Build an event payload for the calendar connector
    const event = {
      summary: business?.branding?.displayName ? `${business.branding.displayName} - Appointment` : 'Appointment',
      description: `Booked via AutomationAgent for ${business?.name || business_id}`,
      start: {dateTime: intent.payload.requested_time || new Date().toISOString()},
      end: {dateTime: new Date(Date.now() + (intent.payload.duration_minutes || 30) * 60000).toISOString()},
    };

    try {
      const cresp = await axios.post(`${CALENDAR_CONNECTOR_BASE}/events`, event, {timeout: 5000});
      return res.json({action: 'booked', calendar_response: cresp.data, ts: new Date().toISOString()});
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Calendar booking failed', message);
      return res.status(502).json({action: 'error', error: message});
    }
  }

  if (intent.type === 'invoice') {
    // In a full system, would call Invoice Agent. For prototype, return structured invoice request
    const invoiceRequest = {business_id, amount_cents: intent.payload.amount_cents, description: intent.payload.description};
    return res.json({action: 'create_invoice', invoiceRequest, ts: new Date().toISOString()});
  }

  if (intent.type === 'question') {
    // Simple echo answer for prototype
    return res.json({action: 'answer', answer: `Received question: ${intent.payload.text}`, ts: new Date().toISOString()});
  }

  return res.json({action: 'noop', ts: new Date().toISOString()});
});

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

app.listen(PORT, () => console.log(`Automation Agent listening on http://localhost:${PORT}`));
