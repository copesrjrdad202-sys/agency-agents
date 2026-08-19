Real API Integration Setup Guide

Overview
This guide walks through integrating real Stripe and Twilio APIs into the multi-agent automation system, replacing the mock connectors.

Prerequisites
- Stripe account (https://stripe.com) with API keys
- Twilio account (https://www.twilio.com) with credentials
- Google OAuth credentials for Calendar (if using booking)
- Environment variables configured in examples/.env

Step 1: Configure Environment Variables

1. Copy .env.example to .env in the examples/ directory:
   cp .env.example .env

2. Add your real credentials:
   
   # Stripe (from https://dashboard.stripe.com/apikeys)
   STRIPE_API_KEY=sk_live_YOUR_STRIPE_KEY_HERE  # or sk_test_... for development
   STRIPE_WEBHOOK_SECRET=whsec_... (optional, for webhook verification)
   
   # Twilio (from https://www.twilio.com/console)
   TWILIO_ACCOUNT_SID=AC...
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+1234567890  # Your Twilio number

3. DO NOT commit .env to git. It's excluded by .gitignore.

Step 2: Start the Real Connectors

Instead of the mock connectors, start the live API versions:

npm run start:stripe    # Starts stripeConnectorLive.ts on port 3500
npm run start:twilio    # Starts twilioConnectorLive.ts on port 3800

Step 3: Test the Real Stripe Connector

Create an invoice with real Stripe:

curl -X POST http://localhost:3500/invoices \
  -H "Content-Type: application/json" \
  -d '{
    "amount_cents": 5000,
    "currency": "usd",
    "description": "Test Invoice",
    "customer_email": "customer@example.com"
  }'

Expected response:
{
  "invoice": {"id": "in_...", "status": "draft"},
  "payment_link": "https://checkout.stripe.com/pay/...",
  "ts": "2026-08-19T..."
}

You can now share the payment_link with customers.

Step 4: Test the Real Twilio Connector

Send an SMS:

curl -X POST http://localhost:3800/sms/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "body": "Hello from the multi-agent system!"
  }'

Expected response:
{
  "message_sid": "SM...",
  "status": "queued",
  "ts": "2026-08-19T..."
}

Make a voice call:

curl -X POST http://localhost:3800/voice/call \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "message": "Your appointment has been confirmed."
  }'

Step 5: Configure Webhooks (Production)

For production, configure Stripe and Twilio webhooks to send events to your deployment:

Stripe Webhooks (https://dashboard.stripe.com/webhooks)
- Endpoint URL: https://your-domain.com/stripe/webhooks
- Events: charge.succeeded, invoice.payment_succeeded, payment_intent.succeeded

Twilio Webhooks (https://www.twilio.com/console/phone-numbers)
- Incoming SMS webhook: https://your-domain.com/twilio/webhooks/sms
- Incoming call webhook: https://your-domain.com/twilio/webhooks/voice

Running All Services Together

Use the provided start-all.sh script to start all agents and connectors (with real APIs):

bash start-all.sh

This starts:
- Google Calendar Connector (mock, requires OAuth)
- Business Context Agent
- Intake Agent
- Automation Agent
- Invoice Agent
- Stripe Connector (live API)
- Payment Agent
- Tax Agent
- Twilio Connector (live API)

Production Checklist

Before deploying to production:

1. Credentials
   - [ ] Store API keys in a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
   - [ ] Use live Stripe keys (sk_live_...), not test keys
   - [ ] Never commit credentials to git

2. Webhooks
   - [ ] Configure Stripe webhooks for payment events
   - [ ] Configure Twilio webhooks for incoming SMS/calls
   - [ ] Use HTTPS (TLS 1.2+) for all webhook URLs
   - [ ] Verify webhook signatures (Stripe and Twilio provide signature verification)

3. Error Handling
   - [ ] Add retry logic with exponential backoff for API calls
   - [ ] Handle rate limits (Stripe: 100 req/s; Twilio: varies)
   - [ ] Log all API errors with context for debugging

4. Testing
   - [ ] Use Stripe test mode (sk_test_...) to test before going live
   - [ ] Test webhook delivery and signature verification
   - [ ] Load test with concurrent requests
   - [ ] Test failure scenarios (network timeouts, API errors)

5. Monitoring & Alerting
   - [ ] Monitor API response times and error rates
   - [ ] Set up alerts for webhook delivery failures
   - [ ] Track Stripe balance and failed charges
   - [ ] Track Twilio message delivery and failed calls

Security Notes

- API Keys: Never log or expose API keys. Use environment variables only.
- Webhooks: Verify signatures to ensure events come from Stripe/Twilio, not attackers.
- HTTPS: Always use HTTPS (TLS 1.2+) for production webhooks.
- Secrets Rotation: Rotate API keys periodically, especially if exposed.
- PCI Compliance: Stripe handles card processing; don't store raw card data.

References

- Stripe API Docs: https://stripe.com/docs/api
- Stripe Webhooks: https://stripe.com/docs/webhooks
- Twilio API Docs: https://www.twilio.com/docs/usage/api
- Twilio Webhooks: https://www.twilio.com/docs/usage/webhooks
