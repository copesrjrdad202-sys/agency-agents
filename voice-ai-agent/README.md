# Voice AI Agent — Zero Investment Voice System

A complete, production-ready full-stack Voice AI Agent for appointment scheduling and lead qualification, built for local service businesses (HVAC, plumbing, electrical, etc.). It follows the "Zero Investment Voice System" architecture:

1. **Voice Interface Layer** — Google Cloud Speech-to-Text / Text-to-Speech
2. **Intelligence Layer** — Anthropic Claude with tool-calling for calendar actions, conversation memory
3. **Integration Layer** — Webhooks for calendar check/booking, Make.com / n8n compatible

## Tech Stack

- Node.js + TypeScript + Express
- Google Cloud Speech-to-Text (`@google-cloud/speech`)
- Google Cloud Text-to-Speech (`@google-cloud/text-to-speech`)
- Anthropic Claude (`@anthropic-ai/sdk`, `claude-3-5-sonnet-20241022` by default)
- In-memory session store (swappable for Redis/SQLite)
- Mock or real Google Calendar booking backend
- Vanilla HTML/JS browser demo client (no build step)

## Project Structure

```
voice-ai-agent/
├── src/
│   ├── config.ts                # Env var loading + Google credential resolution
│   ├── server.ts                # Express app entry point
│   ├── db/
│   │   └── database.ts           # node:sqlite connection + schema (businesses, calls, api_keys)
│   ├── routes/
│   │   ├── webhook.ts            # /api/voice/incoming, /api/calendar/check, /api/calendar/book
│   │   ├── twilio.ts             # /api/twilio/voice, /api/twilio/gather, /api/twilio/audio/:id
│   │   └── admin.ts              # /api/admin/businesses CRUD (multi-tenant management)
│   ├── services/
│   │   ├── voice.ts             # Google STT/TTS wrappers
│   │   ├── llm.ts               # Claude conversation + tool-calling agent
│   │   ├── calendar.ts          # Mock + Google + multi-agent Calendar availability/booking
│   │   ├── businessStore.ts     # Multi-tenant business CRUD over SQLite
│   │   └── session.ts           # In-memory conversation session store
│   └── types/
│       └── index.ts             # Shared TypeScript types
├── scripts/
│   └── provision-business.ts    # CLI: buy a Twilio number + register a business
├── public/
│   ├── index.html                # Browser demo UI
│   └── client.js                 # Mic capture, transcript rendering, audio playback
├── tests/
│   ├── calendar.test.ts
│   └── session.test.ts
├── data/                         # SQLite database file (git-ignored, created at runtime)
├── make_webhook_payload.json     # Make.com / n8n integration template
├── .env.example
├── package.json
└── tsconfig.json
```

## Setup

### 1. Prerequisites
- Node.js 22.5+ (required for the built-in `node:sqlite` module used by the multi-tenant business store)
- An [Anthropic API key](https://console.anthropic.com/)
- A Google Cloud project with the **Speech-to-Text** and **Text-to-Speech** APIs enabled
- (Optional, for real phone calls) A [Twilio](https://www.twilio.com/) account — see "Telephony Setup" below

### 2. Install dependencies
```powershell
cd voice-ai-agent
npm install
```

### 3. Configure environment
```powershell
Copy-Item .env.example .env
```
Edit `.env`:
- `ANTHROPIC_API_KEY` — your Claude API key
- `GOOGLE_APPLICATION_CREDENTIALS` — path to your service account JSON key file, **or**
- `GOOGLE_APPLICATION_CREDENTIALS_BASE64` — base64-encoded contents of that JSON key (useful for platforms like Heroku/Render where you can't upload files)
- `CALENDAR_PROVIDER` — `mock` (default, no setup needed) or `google` (requires `GOOGLE_CALENDAR_ID` and Google Calendar authorization)
- Business details (`BUSINESS_NAME`, `BUSINESS_TYPE`, `BUSINESS_HOURS`, `BUSINESS_SERVICE_AREA`) are injected into Claude's system prompt

> To generate the base64 credential string on Windows PowerShell:
> ```powershell
> [Convert]::ToBase64String([IO.File]::ReadAllBytes("google-credentials.json")) | Set-Clipboard
> ```

### 4. Build & run
```powershell
npm run build
npm start
```
Or for local development with auto-reload:
```powershell
npm run dev
```

The server starts on `http://localhost:3000` (configurable via `PORT`). Open that URL in a browser to use the mic-based demo client — no telephony setup required.

### 5. Run tests
```powershell
npm test
```
Tests cover the calendar service (availability, booking, double-booking prevention, time normalization) and the session store, using Node's built-in test runner (`node:test`) executed via `tsx` — no external API keys required.

## API Endpoints

### `POST /api/voice/incoming`
Runs the full pipeline: **Audio In → STT → Claude (+ tool calls) → TTS → Audio Out**.

Accepts `multipart/form-data`:
| Field | Required | Description |
|---|---|---|
| `audio` | one of `audio`/`text` | Recorded audio file (WEBM/OPUS from browsers, or WAV/LINEAR16 from telephony) |
| `text` | one of `audio`/`text` | Plain text input, for testing without a microphone |
| `sessionId` | no | Reuse to continue a multi-turn conversation |
| `callerPhone` | no | Caller's phone number, stored on the session |
| `encoding` | no | Google STT audio encoding, defaults to `WEBM_OPUS` |
| `sampleRateHertz` | no | Defaults to `48000` |

Response:
```json
{
  "sessionId": "uuid",
  "transcript": "I need someone to look at my AC unit",
  "reply": "I can help with that! What day works best for you?",
  "audioBase64": "...",
  "audioMimeType": "audio/mpeg",
  "toolCalls": [],
  "elapsedMs": 850
}
```

### `POST /api/calendar/check`
```json
{ "date": "2026-09-10", "time": "14:00" }
```
`time` is optional; omit to get all open slots for the day.

### `POST /api/calendar/book`
```json
{
  "client_name": "Jane Doe",
  "phone_number": "+15551234567",
  "date": "2026-09-10",
  "time": "14:00",
  "service_type": "AC repair"
}
```

## Claude Tool-Calling

The LLM service (`src/services/llm.ts`) defines two tools Claude can invoke mid-conversation:
- `check_availability(date, time?)` — verifies real open slots before promising a time
- `book_appointment(client_name, phone_number, date, time, service_type)` — finalizes a booking

Claude is instructed (via system prompt) to never fabricate availability and to always confirm details back to the caller before booking. If `AUTOMATION_WEBHOOK_URL` is set, a `POST` fires automatically after every successful booking so Make.com/n8n can send SMS/email confirmations or update a CRM — see [make_webhook_payload.json](./make_webhook_payload.json) for the exact payload shapes and example scenario wiring.

## Switching to Real Google Calendar

### Recommended: user OAuth (no service-account key)

1. In Google Cloud Console, configure the OAuth consent screen and add the Google account which owns the booking calendar as a test user if the app is in testing.
2. Create an OAuth 2.0 **Desktop app** client under **APIs & Services → Credentials**.
3. Set `CALENDAR_PROVIDER=google`, `GOOGLE_CALENDAR_ID`, `GOOGLE_CALENDAR_OAUTH_CLIENT_ID`, and `GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET` in `.env`. Leave the redirect URI at its default `http://127.0.0.1:53682/oauth2callback`.
4. Run `npm run authorize:calendar` on the machine that runs this service, open the printed URL, and approve access to the intended Google Calendar.
5. The app saves a refresh token in `data/google-calendar-oauth-token.json`. This file is git-ignored and must remain private. Back it up securely if the service will move to another machine.

### Service account alternative

If your Google Cloud organization permits service-account keys, set `CALENDAR_PROVIDER=google`, set `GOOGLE_CALENDAR_ID`, and share the booking calendar with the service account email with "Make changes to events" permission. Configure `GOOGLE_APPLICATION_CREDENTIALS` with the service-account JSON key.

The mock provider requires no setup and is used by default — ideal for demos and the included test suite.

## Wiring into the Multi-Agent Automation System

This service runs standalone (as verified above), but it also plugs directly into the sibling [examples/](../examples) multi-agent automation system in this repo so voice bookings land in the same business calendar, trigger the same reminder emails, and flow through the same automation pipeline as bookings made via the Intake/Automation agents.

1. Start the multi-agent stack (from the `examples/` directory):
   ```powershell
   cd ..\examples
   npm install
   Copy-Item .env.example .env   # fill in Google/Stripe/Twilio creds as needed
   bash start-all.sh             # or run individual `npm run start:*` scripts on Windows
   ```
   This brings up, among others, the **Calendar Agent** (`http://localhost:3401`) and **Automation Agent** (`http://localhost:3200`).
2. Register a business profile via the Business Context Agent (`POST http://localhost:3100/businesses`) with an `id` (e.g. `"default"`) matching what you'll use below.
3. In `voice-ai-agent/.env`, set:
   ```
   CALENDAR_PROVIDER=multi-agent
   MULTI_AGENT_CALENDAR_URL=http://localhost:3401
   MULTI_AGENT_BUSINESS_ID=default
   MULTI_AGENT_AUTOMATION_URL=http://localhost:3200/process
   ```
4. Restart the Voice AI Agent (`npm start`). Now:
   - `check_availability` / `/api/calendar/check` reads real-time availability from the Calendar Agent (mock or real Google Calendar, depending on that business's `calendar.provider` setting in `persistentDb`)
   - `book_appointment` / `/api/calendar/book` creates the event via the Calendar Agent, and — if `MULTI_AGENT_AUTOMATION_URL` is set — also notifies the Automation Agent so it schedules confirmation reminders through the Reminder Agent exactly as it would for a booking that came in through the Intake Agent

`start-all.sh` in `examples/` has also been updated to launch this Voice AI Agent (`voice-ai-agent/`, default port `3950`) alongside the rest of the stack.

## Telephony Setup (Twilio) — Multi-Tenant, Bring-Your-Own-Number

This is how you turn the demo into a real phone-answering service for paying customers, **without** making them change their business number. Each customer keeps their existing line and simply forwards it to a cheap Twilio number on no-answer/busy.

### How it works

```
Customer's existing number (unchanged)
        │  (forwards on no-answer / busy)
        ▼
Twilio number ($1.15/mo + ~$0.0085/min)
        │  webhook
        ▼
POST /api/twilio/voice  →  <Gather input="speech">  →  POST /api/twilio/gather
        │
        ▼
Claude (+ check_availability / book_appointment tools) → Google TTS → <Play>
```

- Twilio's own speech recognition (`<Gather input="speech">`) is used for STT on phone calls — it's built for telephony audio and needs no extra upload step. (The browser demo still uses Google STT on raw audio; both paths feed the same `runConversationTurn` pipeline.)
- Claude's reply is synthesized with Google TTS and served back to Twilio through a short-lived (~5 minute) in-memory audio URL, since `<Play>` requires a fetchable URL rather than inline audio.
- Every business is looked up by the Twilio "To" number against a local SQLite database (via Node's built-in `node:sqlite` — no native build step, so this deploys anywhere Node runs), so one server can host unlimited tenants with their own name, hours, service area, calendar, and voice.

### 1. Set up Twilio credentials

Sign up at [twilio.com](https://www.twilio.com/) (pay-as-you-go, no monthly minimum — see cost notes below) and grab your credentials from the Console:

- **Account SID + Auth Token** (Console home page / Account Info) — the Auth Token is required regardless of anything else below, since it's the only credential Twilio supports for validating inbound webhook signatures.
- **(Recommended) API Key + Secret** — Console → Account → API keys & tokens → Create API key → type **Standard**. Used instead of the Auth Token for outbound API calls (buying/configuring numbers), so you can revoke it independently without rotating your whole account's Auth Token.

Add to `.env`:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx   # optional but recommended
TWILIO_API_KEY_SECRET=your-api-key-secret               # optional but recommended
PUBLIC_BASE_URL=https://voice.yourdomain.com   # or an ngrok/Cloudflare Tunnel URL while testing
ADMIN_API_KEY=<generate a long random string>
```

`PUBLIC_BASE_URL` must be a URL Twilio can reach over the internet — for local development, use `ngrok http 3950` (or similar) and paste the resulting HTTPS URL.

**Trial account note:** the free trial only allows calls to/from phone numbers you've manually verified (Console → Phone Numbers → Verified Caller IDs), and injects a "trial account" announcement before every call — fine for your own testing, but you must upgrade to pay-as-you-go (add a payment method, no monthly minimum) before onboarding any real customer. Typical cost: ~$1.15/month per phone number + ~$0.0085/minute for inbound voice.

### 2. Provision a number + register the business

```powershell
npm run provision -- --name "Acme Plumbing" --areaCode 415 --businessType "Plumbing" --hours "Mon-Fri 8am-6pm" --serviceArea "SF Bay Area" --calendarProvider mock
```

This buys a Twilio local number, points its voice webhook at `/api/twilio/voice`, and writes a business record (name, hours, service area, calendar provider, voice) to the local SQLite database, keyed by that Twilio number. The script prints the number to give the customer.

### 3. Customer forwards their existing line

Tell the customer to set up conditional call forwarding **on their existing number** to the new Twilio number, for "no answer" and "busy" conditions only (so a human always gets first crack at the call). Exact steps depend on their carrier or PBX:
- Most US mobile carriers: `*71<Twilio number>` to enable, `*73` to disable (forward on no answer)
- Most landline/VoIP/PBX systems: an admin setting labeled "Call Forwarding — No Answer/Busy"

The customer's number never changes, and calls they answer live are completely unaffected.

### 4. Manage businesses going forward

The `/api/admin/businesses` REST API (protected by `ADMIN_API_KEY` as a `X-Admin-Key` or `Authorization: Bearer` header) supports full CRUD if you need to update hours, switch calendar providers, or edit the system prompt for a specific tenant:

```
GET    /api/admin/businesses
GET    /api/admin/businesses/:id
POST   /api/admin/businesses
PATCH  /api/admin/businesses/:id
DELETE /api/admin/businesses/:id
```

### Security notes

- All `/api/twilio/*` requests are validated against Twilio's `X-Twilio-Signature` header (via the official `twilio` SDK) so only genuine Twilio requests are accepted. Set `TWILIO_VALIDATE_SIGNATURE=false` only for local testing without a real Twilio account.
- The generated audio cache (`/api/twilio/audio/:id`) uses random UUIDs and expires after 5 minutes — it is not an index of anything guessable or long-lived.
- Rotate `ADMIN_API_KEY` and `TWILIO_AUTH_TOKEN` like any other production secret; never commit `.env`.

## Latency Notes

The pipeline is designed for sub-2-second round trips:
- Phone calls use Twilio's built-in speech recognition (no extra audio upload round trip); the browser demo uses the `phone_call` Google STT model with enhanced recognition, falling back to `LINEAR16`/16kHz if the primary encoding attempt fails
- Claude calls use `max_tokens: 512` and short, conversational system-prompt instructions to keep generation fast
- TTS defaults to MP3 encoding (`en-US-Neural2-F` by default, overridable per business) for compact payload size over HTTP
- Sessions are held in memory (no DB round trip) with a 30-minute inactivity TTL; only business configuration (name, hours, calendar, Twilio number mapping) is persisted to SQLite
