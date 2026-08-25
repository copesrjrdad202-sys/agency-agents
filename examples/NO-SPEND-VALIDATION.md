# No-spend validation checklist

This is the gate before any paid vendors are added. The goal is to prove the internal operating model works without buying Stripe, Twilio, Google, or a voice platform subscription.

## Pass conditions

The system passes the no-spend gate only when all of the following are true:

- Business context loads the correct business profile
- Intake agent accepts a booking request and forwards it to automation
- Automation decides the correct workflow and calls the calendar agent
- Calendar agent books, updates, and cancels appointments in mock mode
- Reminder agent schedules and clears reminder records
- Business profile remains bound to the selected client
- Voice intake session is accepted by the ElevenLabs boundary in mock mode
- The workflow remains stable without any real vendor credentials

## Required local services

Run these before validation:

```bash
cd examples
node dist/businessContextAgent.js
node dist/calendarAgent.js
node dist/automationAgent.js
node dist/reminderAgent.js
node dist/elevenLabsConnector.js
```

## Validation command

```bash
cd examples
npm run validate:no-spend
```

## Expected result

The script should print a JSON summary with status PASS and a business_id of `hvac-plumbing-pro`.

## Spending rule

Do not buy real provider subscriptions until the following are verified in sandbox/test mode:

1. Booking flow works end-to-end
2. Update and cancel flow works
3. Reminder scheduling and cleanup works
4. Tax ledger updates from a paid invoice event work
5. Voice transcript handoff works with the intake pipeline
6. Production deployment is stable in a hosted environment

## Production gate

Only move to production spending after the sandbox pass is complete and every workflow has been proven using test credentials.
