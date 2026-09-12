import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import { getBusiness } from './persistentDb';

dotenv.config();

const PORT = Number(process.env.REMINDER_AGENT_PORT || 3900);

export type ReminderChannel = 'email' | 'sms';
export type ReminderType = 'confirmation' | '24h' | '1h' | 'same-day';
export type ReminderStatus = 'pending' | 'sent' | 'failed';

type Reminder = {
  id: string;
  business_id: string;
  customer_name?: string;
  customer_email: string;
  appointment_id?: string;
  reminder_type: ReminderType;
  channel: ReminderChannel;
  provider: 'smtp' | 'mock';
  send_at: string;
  status: ReminderStatus;
  message: string;
  created_at: string;
  sent_at?: string;
  metadata?: Record<string, string>;
};

const reminders = new Map<string, Reminder>();
const appointmentReminderIds = new Map<string, Set<string>>();
const reminderTimers = new Map<string, NodeJS.Timeout>();

function ensureAppointmentIndex(appointmentId?: string, reminderId?: string) {
  if (!appointmentId || !reminderId) return;
  const set = appointmentReminderIds.get(appointmentId) || new Set<string>();
  set.add(reminderId);
  appointmentReminderIds.set(appointmentId, set);
}

function buildSubject(businessId: string, reminderType: ReminderType) {
  const business = getBusiness(businessId);
  const businessName = business?.branding?.displayName || 'Your service team';
  const labels: Record<ReminderType, string> = {
    confirmation: 'Appointment confirmation',
    '24h': 'Upcoming appointment reminder',
    '1h': 'Upcoming service appointment',
    'same-day': 'Same-day service reminder',
  };
  return `${labels[reminderType]} | ${businessName}`;
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: Number(port) === 465,
    auth: { user, pass },
  });
}

async function sendReminderEmail(reminder: Reminder) {
  const transport = getTransport();
  const business = getBusiness(reminder.business_id);
  const fromAddress = process.env.EMAIL_FROM || 'no-reply@example.com';

  if (!transport) {
    console.log(`[reminder:${reminder.id}] SMTP not configured. Simulating delivery for ${reminder.customer_email}.`);
    return { delivered: false, mode: 'mock', provider: reminder.provider, reminderId: reminder.id };
  }

  await transport.sendMail({
    from: fromAddress,
    to: reminder.customer_email,
    subject: buildSubject(reminder.business_id, reminder.reminder_type),
    text: reminder.message,
  });

  return { delivered: true, mode: 'smtp', provider: 'smtp', reminderId: reminder.id };
}

async function flushReminder(reminderId: string) {
  const reminder = reminders.get(reminderId);
  if (!reminder) {
    throw new Error(`Reminder not found: ${reminderId}`);
  }

  try {
    const result = reminder.channel === 'email' ? await sendReminderEmail(reminder) : { delivered: false, mode: 'mock', provider: 'mock', reminderId: reminder.id };
    reminder.status = result.delivered ? 'sent' : 'pending';
    reminder.sent_at = result.delivered ? new Date().toISOString() : undefined;
    if (!result.delivered) {
      reminder.provider = 'mock';
    }
    return { reminder, result };
  } catch (error: any) {
    reminder.status = 'failed';
    reminder.provider = 'mock';
    return { reminder, error: error.message };
  }
}

function queueReminder(reminder: Reminder) {
  const existingTimer = reminderTimers.get(reminder.id);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  reminders.set(reminder.id, reminder);
  ensureAppointmentIndex(reminder.appointment_id, reminder.id);

  const sendAtMs = new Date(reminder.send_at).getTime() - Date.now();
  const delay = Math.max(0, sendAtMs);

  const timer = setTimeout(() => {
    flushReminder(reminder.id).catch((err) => {
      console.error(`[reminder:${reminder.id}] failed to send`, err);
    });
  }, delay);
  reminderTimers.set(reminder.id, timer);

  return reminder;
}

function cancelReminder(reminderId: string) {
  const reminder = reminders.get(reminderId);
  if (!reminder) {
    return null;
  }

  const timer = reminderTimers.get(reminderId);
  if (timer) {
    clearTimeout(timer);
    reminderTimers.delete(reminderId);
  }

  reminders.delete(reminderId);
  const appointmentId = reminder.appointment_id;
  if (appointmentId) {
    const set = appointmentReminderIds.get(appointmentId);
    if (set) {
      set.delete(reminderId);
      if (set.size === 0) {
        appointmentReminderIds.delete(appointmentId);
      } else {
        appointmentReminderIds.set(appointmentId, set);
      }
    }
  }

  return reminder;
}

function cancelAppointmentReminders(appointmentId: string) {
  const reminderIds = appointmentReminderIds.get(appointmentId) || new Set<string>();
  const cancelled: Reminder[] = [];
  for (const reminderId of Array.from(reminderIds)) {
    const reminder = cancelReminder(reminderId);
    if (reminder) {
      cancelled.push({ ...reminder, status: 'failed' as ReminderStatus });
    }
  }
  return cancelled;
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString(), reminders: reminders.size });
});

app.get('/reminders', (_req, res) => {
  res.json({
    count: reminders.size,
    reminders: Array.from(reminders.values()),
    ts: new Date().toISOString(),
  });
});

app.post('/schedule', async (req, res) => {
  try {
    const body = req.body || {};
    const businessId = body.business_id || body.businessId;
    const customerEmail = body.customer_email || body.customerEmail;
    if (!businessId || !customerEmail) {
      return res.status(400).json({ error: 'business_id and customer_email are required' });
    }

    const reminder: Reminder = {
      id: body.id || `rem-${Date.now()}`,
      business_id: businessId,
      customer_name: body.customer_name || body.customerName,
      customer_email: customerEmail,
      appointment_id: body.appointment_id || body.appointmentId,
      reminder_type: body.reminder_type || 'confirmation',
      channel: body.channel || 'email',
      provider: body.provider || 'smtp',
      send_at: body.send_at || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: 'pending',
      message: body.message || `This is a service reminder from ${getBusiness(businessId)?.branding?.displayName || 'your local service provider'}. Please confirm the appointment details and call us if anything changes.`,
      created_at: new Date().toISOString(),
      metadata: body.metadata || {},
    };

    const scheduled = queueReminder(reminder);
    res.status(201).json({ action: 'scheduled', reminder: scheduled, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.post('/businesses/:businessId/reminders', async (req, res) => {
  try {
    const payload = { ...req.body, business_id: req.params.businessId };
    const reminder: Reminder = {
      id: payload.id || `rem-${Date.now()}`,
      business_id: payload.business_id,
      customer_name: payload.customer_name || payload.customerName,
      customer_email: payload.customer_email || payload.customerEmail,
      appointment_id: payload.appointment_id || payload.appointmentId,
      reminder_type: payload.reminder_type || 'confirmation',
      channel: payload.channel || 'email',
      provider: payload.provider || 'smtp',
      send_at: payload.send_at || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      status: 'pending',
      message: payload.message || `This is a service reminder for ${payload.business_id}.`,
      created_at: new Date().toISOString(),
      metadata: payload.metadata || {},
    };

    const scheduled = queueReminder(reminder);
    res.status(201).json({ action: 'scheduled', reminder: scheduled, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.post('/send/:reminderId', async (req, res) => {
  try {
    const reminder = await flushReminder(req.params.reminderId);
    res.json({ action: 'processed', ...reminder, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(404).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.put('/reminders/:reminderId/reschedule', async (req, res) => {
  try {
    const reminder = reminders.get(req.params.reminderId);
    if (!reminder) {
      return res.status(404).json({ error: 'Reminder not found', ts: new Date().toISOString() });
    }

    const sendAt = req.body?.send_at || req.body?.sendAt;
    if (sendAt) {
      reminder.send_at = sendAt;
      reminder.status = 'pending';
      queueReminder(reminder);
    }

    res.json({ action: 'rescheduled', reminder, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.delete('/appointments/:appointmentId/reminders', async (req, res) => {
  try {
    const cancelled = cancelAppointmentReminders(req.params.appointmentId);
    res.json({ action: 'cancelled', appointment_id: req.params.appointmentId, cancelled, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.listen(PORT, () => {
  console.log(`Reminder Agent listening on http://localhost:${PORT}`);
});
