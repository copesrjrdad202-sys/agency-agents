Google Calendar connector (Node.js + TypeScript)

Overview
- Minimal connector to perform OAuth2 (authorization code flow), list events, create events, and receive push webhooks for calendar changes.
- Intended as a prototype component for the multi-agent automation system.

Files added
- package.json — example project manifest for this connector
- googleCalendarConnector.ts — TypeScript Express server that implements OAuth2 flow, event listing/creation, and a webhook endpoint
- .env.example — required environment variables

Getting started (local test)
1. Open a terminal and cd into the examples/ directory.
2. Copy .env.example to .env and populate GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (create an OAuth client in Google Cloud Console). Ensure redirect URI matches (default http://localhost:3000/oauth2callback).
3. npm install
4. npm start
5. Open http://localhost:3000/auth to get the authorization URL. Complete the OAuth flow — tokens will be saved to examples/google_tokens.json.

6. Business-owned onboarding (no credentials shared with operator)
   - Use the provided onboarding helper to let a business owner perform OAuth locally and keep tokens under their control.
   - Run: node onboardGoogleClient.js <businessId> <GOOGLE_CLIENT_ID> <GOOGLE_CLIENT_SECRET> [PORT]
   - The helper starts a localhost server (default port 3005), prints (and attempts to open) the auth URL, accepts the callback, and saves tokens to examples/tokens-<businessId>.json.
   - After onboarding, update the Business Context Agent profile for that business to reference the saved tokens file (e.g., credentialsPath: './tokens-<businessId>.json') or transfer the tokens into the business's secret store.

7. Use /events GET to list upcoming events, POST /events to create an event, and configure a Google Calendar watch to send push notifications to /webhook.

Notes and next steps
- Token storage is file-based for the prototype; production must use secure secret storage with per-business contexts and encryption.
- Webhook handling is minimal; implement verification of X-Goog-Channel-Token and secure endpoints with TLS and URL validation in production.
- The connector should be wrapped into a service that the Business Context Agent can call with the right business credentials.

Security
- Do not commit real secrets to version control. Use environment variables or a secrets manager.
- For production, enable HTTPS, validate push notification tokens, and restrict OAuth client redirect URIs.
