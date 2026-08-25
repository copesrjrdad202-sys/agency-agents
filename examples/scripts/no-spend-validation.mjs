import fs from 'fs';
import path from 'path';

const REQUIRED_SERVICES = [
  { name: 'Business Context', url: 'http://localhost:3100/health' },
  { name: 'Calendar Agent', url: 'http://localhost:3401/health' },
  { name: 'Automation Agent', url: 'http://localhost:3200/health' },
  { name: 'Reminder Agent', url: 'http://localhost:3900/health' },
  { name: 'ElevenLabs Connector', url: 'http://localhost:3901/health' },
];

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response from ${url}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${url} :: ${JSON.stringify(body)}`);
  }
  return body;
}

async function main() {
  const results = [];
  for (const service of REQUIRED_SERVICES) {
    try {
      const body = await fetchJson(service.url);
      results.push({ service: service.name, ok: true, response: body });
    } catch (err) {
      results.push({ service: service.name, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error('No-spend validation failed: required services are not running.');
    for (const item of failed) {
      console.error(`- ${item.service}: ${item.error}`);
    }
    console.error('\nStart them with:');
    console.error('  node dist/businessContextAgent.js');
    console.error('  node dist/calendarAgent.js');
    console.error('  node dist/automationAgent.js');
    console.error('  node dist/reminderAgent.js');
    console.error('  node dist/elevenLabsConnector.js');
    process.exit(1);
  }

  const payload = {
    business_id: 'hvac-plumbing-pro',
    intent: {
      type: 'book',
      payload: {
        requested_time: '2026-08-25T09:00:00.000Z',
        duration_minutes: 60,
        service_name: 'Drain Cleaning',
        customer_email: 'customer@example.com',
      },
    },
    caller: 'No Spend Validation',
    email: 'customer@example.com',
  };

  const booked = await fetchJson('http://localhost:3200/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!booked.action || booked.action !== 'booked') {
    throw new Error(`Booking flow failed: ${JSON.stringify(booked)}`);
  }

  const eventId = booked.calendar_response?.created?.id;
  if (!eventId) {
    throw new Error(`Missing booking event id: ${JSON.stringify(booked)}`);
  }

  if (!booked.reminder_response || booked.reminder_response.action !== 'scheduled') {
    throw new Error(`Reminder scheduling failed: ${JSON.stringify(booked)}`);
  }

  const update = await fetchJson('http://localhost:3200/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: 'hvac-plumbing-pro',
      intent: {
        type: 'update_booking',
        payload: {
          target_event_id: eventId,
          requested_time: '2026-08-25T10:00:00.000Z',
          duration_minutes: 75,
          service_name: 'Drain Cleaning',
          customer_email: 'customer@example.com',
        },
      },
      caller: 'No Spend Validation',
      email: 'customer@example.com',
    }),
  });

  if (update.action !== 'updated') {
    throw new Error(`Update flow failed: ${JSON.stringify(update)}`);
  }

  if (!update.reminder_response || update.reminder_response.action !== 'scheduled') {
    throw new Error(`Reminder reschedule failed: ${JSON.stringify(update)}`);
  }

  const cancel = await fetchJson('http://localhost:3200/process', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: 'hvac-plumbing-pro',
      intent: {
        type: 'cancel_booking',
        payload: {
          target_event_id: eventId,
          action: 'cancel',
          calendar_id: 'primary',
        },
      },
      caller: 'No Spend Validation',
      email: 'customer@example.com',
    }),
  });

  if (cancel.action !== 'cancelled') {
    throw new Error(`Cancel flow failed: ${JSON.stringify(cancel)}`);
  }

  if (!cancel.reminder_response || cancel.reminder_response.action !== 'cancelled') {
    throw new Error(`Reminder cancellation failed: ${JSON.stringify(cancel)}`);
  }

  const voiceSession = await fetchJson('http://localhost:3901/voice/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: 'hvac-plumbing-pro',
      transcript: 'I need a drain cleaning before Friday',
    }),
  });

  if (!voiceSession.status || voiceSession.status !== 'ready') {
    throw new Error(`Voice intake test failed: ${JSON.stringify(voiceSession)}`);
  }

  const summary = {
    status: 'PASS',
    no_spend_validation: true,
    checked_services: results.map((r) => ({ service: r.service, ok: r.ok })),
    booking_event_id: eventId,
    business_id: 'hvac-plumbing-pro',
    ts: new Date().toISOString(),
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log('No-spend validation passed. Proven business logic is working without paid provider subscriptions.');
}

main().catch((err) => {
  console.error('No-spend validation failed.');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
