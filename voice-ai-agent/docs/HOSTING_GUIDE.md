# Hosting & Infrastructure Recommendations for Production Voice AI Agent

## Overview
To deliver sub-2 second latency for live Twilio phone calls, the Voice AI Agent requires:
1. **Persistent Node.js runtime** (no cold starts).
2. **Persistent Storage** (for the SQLite database holding multi-tenant business configurations and call logs).
3. **Public HTTPS domain with SSL** (required by Twilio webhooks).
4. **Low latency regional deployment** (close to Twilio server regions: US-East, US-West, EU-Central).

---

## Top Production Hosting Options

### 1. Railway.app (RECOMMENDED for Fast Launch)
- **Cost**: ~$5 - $10/month (pay as you go)
- **Pros**:
  - Continuous Node.js process (zero cold starts).
  - Built-in persistent volume support for `./data/voice-ai-agent.db`.
  - Automatic HTTPS domain (`your-app.up.railway.app`).
  - Automatic deployment on `git push`.
  - Simple environment variable management.

### 2. Render.com (Web Service + Persistent Disk)
- **Cost**: ~$7/month (Starter tier)
- **Pros**:
  - Reliable Node.js container hosting.
  - Supports persistent disk mounting (`/data`).
  - Automatic SSL / custom domain support.

### 3. DigitalOcean Droplet / Hetzner VPS (BEST for Scale & Lowest Cost)
- **Cost**: ~$4 - $6/month
- **Pros**:
  - Dedicated virtual server with full root control.
  - Predictable cost regardless of call volume.
  - Run PM2 / Docker + NGINX + Certbot for SSL.
  - Lowest latency and maximum performance.

### 4. Fly.io
- **Cost**: ~$3 - $5/month
- **Pros**:
  - Deploy containers globally near Twilio regional nodes.
  - Supports persistent SQLite volumes (`fly volumes`).

---

## Deployment Architecture Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Mount persistent storage volume at `./data` (for SQLite)
- [ ] Configure `PUBLIC_BASE_URL=https://your-domain.com`
- [ ] Configure `ANTHROPIC_API_KEY`, `TWILIO_*`, `GOOGLE_*` in production env vars
- [ ] Set up Twilio Webhook URL: `https://your-domain.com/api/twilio/voice`
