Business Context Agent (Node.js + TypeScript)

Overview
- Simple HTTP service that stores per-business profiles (branding, services, calendar credentials reference, invoice template, tax sheet path).
- Intended as a prototype in-memory/file-backed context store that other agents can query to load business-specific configuration.

Files
- businessContextAgent.ts — Express server exposing /businesses endpoints for CRUD operations
- data/businesses.json — file-backed store with sample business profile 'prototype:google-stripe-twilio'

Run locally
1. From the examples/ folder run: npm install (if not already done)
2. Start the Business Context Agent with: ts-node-dev --respawn --transpile-only businessContextAgent.ts
3. The agent listens on port 3100 by default. Endpoints:
   - GET /businesses
   - GET /businesses/:id
   - POST /businesses  (body: full BusinessProfile)
   - PUT /businesses/:id  (body: partial updates)
   - DELETE /businesses/:id

Next steps
- Replace file-based storage with a secure per-business secret store for credentials.
- Add authentication and request signing for inter-agent calls.
- Implement per-business RBAC and audit logging for changes.
