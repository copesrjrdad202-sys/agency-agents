import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();
const PORT = process.env.AUTOMATION_AGENT_PORT || 3200;
const BUSINESS_CONTEXT = process.env.BUSINESS_CONTEXT_URL || 'http://localhost:3100/businesses';
const CALENDAR_AGENT_BASE = process.env.CALENDAR_AGENT_URL || 'http://localhost:3401';
const REMINDER_AGENT_BASE = process.env.REMINDER_AGENT_URL || 'http://localhost:3900';

const app = express();
app.use(bodyParser.json());

const STRIPE_CONNECTOR_BASE = process.env.STRIPE_CONNECTOR_URL || 'http://localhost:3500';
const PAYMENT_AGENT_BASE = process.env.PAYMENT_AGENT_URL || 'http://localhost:3600';

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
    const requestedTime = intent.payload.requested_time || new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const durationMinutes = Number(intent.payload.duration_minutes || business?.services?.[0]?.duration_minutes || 60);
    const serviceName = intent.payload.service_name || intent.payload.service_id || business?.services?.[0]?.name || 'Service visit';
    const customerEmail = intent.payload.customer_email || payload.email || payload.customer?.email || `${(payload.caller || 'customer').replace(/\s+/g, '.').toLowerCase()}@example.com`;
    const event = {
      summary: business?.branding?.displayName ? `${business.branding.displayName} - ${serviceName}` : serviceName,
      description: `Booked via AutomationAgent for ${business?.name || business_id}. Service: ${serviceName}. Customer: ${payload.caller || 'Guest'}.`,
      start: {dateTime: requestedTime},
      end: {dateTime: new Date(new Date(requestedTime).getTime() + durationMinutes * 60000).toISOString()},
    };

    try {
      const cresp = await axios.post(`${CALENDAR_AGENT_BASE}/businesses/${encodeURIComponent(business_id)}/book`, event, {timeout: 5000});

      const reminderPayload = {
        business_id,
        customer_name: payload.caller || 'Customer',
        customer_email: customerEmail,
        appointment_id: cresp.data?.created?.id || `appt-${Date.now()}`,
        reminder_type: 'confirmation',
        channel: 'email',
        provider: 'smtp',
        send_at: new Date(Date.now() + 60 * 1000).toISOString(),
        message: `Hello ${payload.caller || 'Customer'}, this is a confirmation for your ${serviceName} appointment with ${business?.branding?.displayName || business?.name || 'your service team'}. We look forward to seeing you.`,
      };

      let reminderResponse = null;
      try {
        reminderResponse = await axios.post(`${REMINDER_AGENT_BASE}/schedule`, reminderPayload, {timeout: 5000});
      } catch (reminderErr: any) {
        console.warn('Reminder scheduling failed', reminderErr?.message || String(reminderErr));
      }

      return res.json({
        action: 'booked',
        calendar_response: cresp.data,
        reminder_response: reminderResponse?.data || null,
        ts: new Date().toISOString(),
      });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Calendar booking failed', message);
      return res.status(502).json({action: 'error', error: message});
    }
  }

  if (intent.type === 'modify_booking' || intent.type === 'cancel_booking' || intent.type === 'update_booking') {
    const bookingId = intent.payload.target_event_id || intent.payload.event_id || intent.payload.appointment_id || intent.payload.booking_id;
    const calendarId = intent.payload.calendar_id || 'primary';
    const isCancel = intent.type === 'cancel_booking' || (intent.payload.action || '').toLowerCase() === 'cancel';

    try {
      if (isCancel) {
        if (!bookingId) {
          return res.status(400).json({ action: 'error', error: 'Missing booking id for cancellation', ts: new Date().toISOString() });
        }

        const cancelResp = await axios.delete(`${CALENDAR_AGENT_BASE}/businesses/${encodeURIComponent(business_id)}/cancel/${encodeURIComponent(bookingId)}`, { params: { calendarId }, timeout: 5000 });
        let reminderResp: any = null;
        try {
          reminderResp = await axios.delete(`${REMINDER_AGENT_BASE}/appointments/${encodeURIComponent(bookingId)}/reminders`, { timeout: 5000 });
        } catch (reminderErr: any) {
          console.warn('Reminder cancellation failed', reminderErr?.message || String(reminderErr));
        }

        return res.json({ action: 'cancelled', calendar_response: cancelResp.data, reminder_response: reminderResp?.data || null, ts: new Date().toISOString() });
      }

      if (!bookingId) {
        return res.status(400).json({ action: 'error', error: 'Missing booking id for update', ts: new Date().toISOString() });
      }

      const requestedTime = intent.payload.requested_time || new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const durationMinutes = Number(intent.payload.duration_minutes || business?.services?.[0]?.duration_minutes || 60);
      const summary = business?.branding?.displayName ? `${business.branding.displayName} - ${intent.payload.service_name || 'Service'} ` : 'Service Appointment';
      const eventUpdate = {
        summary: summary.trim(),
        description: `Updated via AutomationAgent for ${business?.name || business_id}.`,
        calendarId,
        start: { dateTime: requestedTime },
        end: { dateTime: new Date(new Date(requestedTime).getTime() + durationMinutes * 60000).toISOString() },
      };

      const updateResp = await axios.put(`${CALENDAR_AGENT_BASE}/businesses/${encodeURIComponent(business_id)}/update/${encodeURIComponent(bookingId)}`, eventUpdate, { timeout: 5000 });

      let reminderResp: any = null;
      try {
        await axios.delete(`${REMINDER_AGENT_BASE}/appointments/${encodeURIComponent(bookingId)}/reminders`, { timeout: 5000 });
        reminderResp = await axios.post(`${REMINDER_AGENT_BASE}/schedule`, {
          business_id,
          customer_name: payload.caller || 'Customer',
          customer_email: intent.payload.customer_email || payload.email || `${(payload.caller || 'customer').replace(/\s+/g, '.').toLowerCase()}@example.com`,
          appointment_id: bookingId,
          reminder_type: 'confirmation',
          channel: 'email',
          provider: 'smtp',
          send_at: new Date(Date.now() + 60 * 1000).toISOString(),
          message: `This is a reminder that your ${intent.payload.service_name || 'appointment'} has been updated. Please confirm the details with ${business?.branding?.displayName || business?.name || 'your service team'}.`,
        }, { timeout: 5000 });
      } catch (reminderErr: any) {
        console.warn('Reminder resync failed', reminderErr?.message || String(reminderErr));
      }

      return res.json({ action: 'updated', calendar_response: updateResp.data, reminder_response: reminderResp?.data || null, ts: new Date().toISOString() });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Calendar modify failed', message);
      return res.status(502).json({ action: 'error', error: message });
    }
  }

  if (intent.type === 'invoice') {
    const amount_cents = intent.payload.amount_cents;
    const description = intent.payload.description || 'Service invoice';
    const customer_email = intent.payload.customer_email || payload.email || `${(payload.caller || 'customer').replace(/\s+/g, '.').toLowerCase()}@example.com`;
    
    if (!amount_cents) {
      return res.status(400).json({action: 'error', error: 'Missing amount_cents', ts: new Date().toISOString()});
    }

    try {
      const stripeResp = await axios.post(`${STRIPE_CONNECTOR_BASE}/invoices`, {
        amount_cents,
        currency: 'usd',
        description,
        customer_email,
        business_id,
        metadata: {service: description, business_id}
      }, {timeout: 5000});

      let paymentRecord: any = null;
      try {
        paymentRecord = await axios.post(`${PAYMENT_AGENT_BASE}/payments`, {
          invoice_id: stripeResp.data?.invoice?.id,
          business_id,
          amount_cents,
          payment_method: 'stripe',
          status: 'pending',
          reference: stripeResp.data?.invoice?.id
        }, {timeout: 5000});
      } catch (payErr: any) {
        console.warn('Payment recording failed', payErr?.message || String(payErr));
      }

      return res.json({
        action: 'invoice_created',
        invoice: stripeResp.data?.invoice,
        payment_link: stripeResp.data?.payment_link,
        payment_record: paymentRecord?.data?.payment || null,
        ts: new Date().toISOString()
      });
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Stripe invoice creation failed', message);
      return res.status(502).json({action: 'error', error: message, ts: new Date().toISOString()});
    }
  }

  if (intent.type === 'question') {
    // Simple echo answer for prototype
    return res.json({action: 'answer', answer: `Received question: ${intent.payload.text}`, ts: new Date().toISOString()});
  }

  return res.json({action: 'noop', ts: new Date().toISOString()});
});

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

app.listen(PORT, () => console.log(`Automation Agent listening on http://localhost:${PORT}`));
