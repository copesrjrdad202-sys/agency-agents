Multi-Agent Automation System Prototype

Overview
A distributed system of autonomous agents that handle customer communication and business operations for small service-based businesses. Agents collaborate to answer calls, book appointments, generate invoices, track payments, and update tax records in real time.

Architecture

Agents (HTTP services)
1. Business Context Agent (port 3100) — Stores and serves business profiles (branding, services, pricing, calendar/invoice configs)
2. Intake Agent (port 3300) — Receives calls/messages, extracts structured intents (booking, invoice, question)
3. Automation Agent (port 3200) — Decides actions, orchestrates workflow, calls Calendar/Invoice/Payment agents
4. Calendar Agent — Syncs with Google Calendar connector; creates, updates, and lists appointments
5. Invoice Agent (port 3400) — Creates invoices, stores in-memory (in production: Stripe)
6. Payment Agent (port 3600) — Records payments, marks invoices as paid
7. Tax Agent (port 3700) — Updates tax ledger with paid invoice amounts

Connectors (integrate with external services)
1. Google Calendar Connector (port 3000) — OAuth2, event CRUD, push notifications
2. Stripe Connector (port 3500) — Mock Stripe (payment links, invoices)
3. Twilio Connector (port 3800) — Mock Twilio (incoming SMS/voice, outbound messages)

Quick start (local development)

Prerequisites
- Node.js 18+ and npm
- Optional: ngrok or tunnel for public HTTPS webhooks

1. Install dependencies in examples/ folder:
   npm install

2. Start all services (Unix/Mac/WSL):
   bash ./start-all.sh

   Or on Windows, start them individually in separate terminals:
   npm run start:business
   npm run start:connector
   npm run start:intake
   npm run start:automation
   npm run start:invoice
   npm run start:payment
   npm run start:tax
   npm run start:stripe
   npm run start:twilio

3. Health check all services:
   curl http://localhost:3100/health
   curl http://localhost:3200/health
   curl http://localhost:3300/health
   ... (etc for all ports)

4. Onboard a business (Google Calendar OAuth):
   npm run onboard -- <businessId> <GOOGLE_CLIENT_ID> <GOOGLE_CLIENT_SECRET>
   Example: npm run onboard -- my-salon abc123.apps.googleusercontent.com secret456

   The helper will print an auth URL and attempt to open it in your browser. Complete the OAuth flow to save tokens to examples/tokens-<businessId>.json.

5. Update Business Context Agent with the tokens file:
   curl -X PUT http://localhost:3100/businesses/<businessId> \
     -H "Content-Type: application/json" \
     -d '{"calendar":{"provider":"google","credentialsPath":"./tokens-<businessId>.json","calendarId":"primary"}}'

6. Test an end-to-end booking flow:
   curl -X POST http://localhost:3300/intake \
     -H "Content-Type: application/json" \
     -d '{
       "business_id":"<businessId>",
       "channel":"sms",
       "caller":{"phone":"+1234567890"},
       "text":"I want to book an appointment",
       "metadata":{"requested_time":"2026-08-19T15:00:00-07:00","service_id":"svc-1"}
     }'

   Expected flow:
   - Intake Agent parses intent -> "book"
   - Automation Agent receives intent
   - Automation Agent calls Business Context Agent to load business profile
   - Automation Agent calls Calendar Connector to create event in Google Calendar
   - Automation Agent returns booking confirmation to Intake Agent
   - If OAuth tokens are present, event will be created in the business's calendar

Workflow: Booking → Invoice → Payment → Tax Update

1. Customer calls/messages (Twilio)
   ↓
2. Intake Agent extracts booking intent
   ↓
3. Automation Agent calls Calendar Agent
   ↓
4. Calendar Agent checks availability, creates event in Google Calendar
   ↓
5. Automation Agent calls Invoice Agent to generate invoice
   ↓
6. Invoice Agent creates Stripe invoice object with payment link
   ↓
7. Customer receives invoice via SMS/email
   ↓
8. Customer pays (Stripe webhook)
   ↓
9. Payment Agent records payment, marks invoice as paid
   ↓
10. Tax Agent updates business tax ledger with paid amount

Files

Agents (examples/ directory)
- businessContextAgent.ts — Business profile service
- intakeAgent.ts — Call/message handler
- automationAgent.ts — Workflow orchestrator
- invoiceAgent.ts — Invoice CRUD
- paymentAgent.ts — Payment recording
- taxAgent.ts — Tax ledger

Connectors
- googleCalendarConnector.ts — Google Calendar API wrapper
- stripeConnector.ts — Mock Stripe (can be replaced with real API)
- twilioConnector.ts — Mock Twilio (can be replaced with real API)

Helpers & Config
- onboardGoogleClient.ts — Business-owned OAuth helper
- watchSetup.ts — Subscribe calendar to push notifications
- businessContextAgent.ts uses data/businesses.json for sample data
- package.json — Dependencies and scripts
- tsconfig.json — TypeScript configuration

Security & Production Notes

OAuth & Credentials
- Onboarding helper allows businesses to perform OAuth locally, keeping tokens under their control
- In production: use a secure secret manager (AWS Secrets Manager, HashiCorp Vault, etc.)
- Never commit credentials to version control

Authentication & Authorization
- Prototype uses no auth; production must add:
  - TLS/HTTPS for all inter-service calls
  - Request signing (JWT, HMAC-SHA256)
  - Per-business RBAC
  - Rate limiting & circuit breakers

Data Storage
- Prototype uses in-memory (invoices, payments) and file-based (businesses, tax sheets)
- Production: use a database (PostgreSQL, MongoDB) with encryption at rest
- Sensitive data (PII, payment info): encrypt before storage

Webhooks & External APIs
- Prototype connectors are mocks; replace with real Stripe, Twilio, Google API calls
- Validate incoming webhooks (verify signatures)
- Implement idempotency (handle duplicate webhook deliveries)
- Retry logic with exponential backoff

Testing & Monitoring
- Add structured logging (JSON logs, correlate by request ID)
- Add metrics (Prometheus, DataDog)
- Add alerting (Slack, PagerDuty)
- Test with sample businesses and realistic workflows
- Load test with concurrent booking/payment scenarios

Next Steps

Priority
1. Real OAuth integration with actual Google Client credentials
2. Real Stripe API integration (move beyond mock)
3. Real Twilio API integration
4. Persistent database (replace file/in-memory stores)
5. Add authentication and authorization
6. Add comprehensive error handling & retries
7. Add end-to-end tests & demo workflow

Deferred (post-MVP)
- Calendar Agent higher-level orchestration
- Privacy & security review (GDPR/CCPA/PCI)
- Full demo with multiple businesses
- Scalability & load testing
- Admin dashboard & reporting
- Multi-language support
- Advanced features (recurring appointments, batch invoicing, etc.)

Contributing

To add a new agent:
1. Create agentName.ts in examples/
2. Define REST endpoints (minimal: GET /health, POST /process or similar)
3. Add an npm script to package.json
4. Document the endpoints in this README
5. Test with curl or Postman
6. Integrate with Automation Agent workflow if it's part of a booking/invoice flow

Questions or Issues
- Check agent logs (printed to stdout)
- Verify all services are running: curl http://localhost:PORT/health
- Ensure OAuth tokens are present if testing calendar functionality
- Check firewall/proxy blocking local ports 3000-3800

License

This is a prototype for demonstration and development purposes. Adapt and extend for your business needs.
