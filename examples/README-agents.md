Intake Agent and Automation Agent (Node.js + TypeScript)

Overview
- Intake Agent: receives raw incoming messages or call transcription and extracts a structured intent to forward to the Automation Agent.
- Automation Agent: simple workflow decisioning prototype. For booking intents it calls the Google Calendar connector at /events. For invoice intents it returns a structured invoice request (real system would call Invoice Agent).

Files
- intakeAgent.ts — Express service that accepts /intake and forwards structured intents to Automation Agent
- automationAgent.ts — Express service that accepts /process and makes decisions; calls Business Context Agent and Calendar connector
- watchSetup.ts — helper script to create a Google Calendar push watch subscription once OAuth tokens exist. Requires CALENDAR_WEBHOOK_URL in env

Run locally
1. Ensure examples dependencies are installed (npm install in examples/)
2. Start Automation Agent: npx ts-node-dev --respawn --transpile-only automationAgent.ts (listens on 3200)
3. Start Intake Agent: npx ts-node-dev --respawn --transpile-only intakeAgent.ts (listens on 3300)
4. Optionally create a calendar watch once OAuth tokens are saved: npx ts-node watchSetup.ts (ensure CALENDAR_WEBHOOK_URL env var is set to the public webhook URL that Google can call)

Notes
- These agents are HTTP prototypes for local development and demonstration. In production they should run with authentication, TLS, request signing, retries, idempotency, and persistent audit logs.
- To test a booking flow: POST to http://localhost:3300/intake with body {business_id:"prototype:google-stripe-twilio", channel:"sms", caller:{phone:"+1..."}, text:"I want to book", metadata:{requested_time:"2026-08-19T15:00:00-07:00"}}
- The Automation Agent will call the Google Calendar connector /events endpoint to create the event for the business's calendar context if OAuth tokens are present and connector is authorized.
