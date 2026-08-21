import express from 'express';
import bodyParser from 'body-parser';
import { deleteBusiness, getBusiness, listBusinesses, upsertBusiness, type BusinessProfile } from './persistentDb';

const PORT = process.env.BUSINESS_CONTEXT_PORT || 3100;

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

// List businesses
app.get('/businesses', (_req, res) => {
  res.json({businesses: listBusinesses(), ts: new Date().toISOString()});
});

// Get a single business
app.get('/businesses/:id', (req, res) => {
  const id = req.params.id;
  const b = getBusiness(id);
  if (!b) return res.status(404).json({error: 'Business not found'});
  res.json({business: b, ts: new Date().toISOString()});
});

// Create or update a business
app.post('/businesses', (req, res) => {
  const body = req.body as BusinessProfile;
  if (!body || !body.id || !body.name) return res.status(400).json({error: 'Missing id or name'});
  const business = upsertBusiness(body);
  res.json({business, ts: new Date().toISOString()});
});

app.put('/businesses/:id', (req, res) => {
  const id = req.params.id;
  const body = req.body as Partial<BusinessProfile>;
  const existing = getBusiness(id);
  if (!existing) return res.status(404).json({error: 'Business not found'});
  const updated = {...existing, ...body};
  const business = upsertBusiness(updated as BusinessProfile);
  res.json({business, ts: new Date().toISOString()});
});

app.delete('/businesses/:id', (req, res) => {
  const id = req.params.id;
  if (!deleteBusiness(id)) return res.status(404).json({error: 'Business not found'});
  res.json({deleted: id, ts: new Date().toISOString()});
});

app.listen(PORT, () => {
  console.log(`Business Context Agent listening on http://localhost:${PORT}`);
});

// If run directly with ts-node-dev, no export needed; consumers can call HTTP endpoints.
