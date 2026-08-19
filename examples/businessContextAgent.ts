import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';

const PORT = process.env.BUSINESS_CONTEXT_PORT || 3100;
const DATA_DIR = path.join(__dirname, 'data');
const BUSINESSES_FILE = path.join(DATA_DIR, 'businesses.json');

type Service = {
  id: string;
  name: string;
  description?: string;
  price_cents: number; // integer cents
  duration_minutes?: number;
};

type BusinessProfile = {
  id: string;
  name: string;
  branding?: {
    displayName?: string;
    greeting?: string;
    brandColor?: string;
  };
  services: Service[];
  calendar?: {
    provider: 'google';
    credentialsPath?: string; // path to tokens file or secret reference
    calendarId?: string;
  } | null;
  invoiceTemplate?: string;
  taxSheetPath?: string;
  contact?: {
    phone?: string;
    email?: string;
  };
};

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive: true});
  if (!fs.existsSync(BUSINESSES_FILE)) fs.writeFileSync(BUSINESSES_FILE, JSON.stringify({}, null, 2));
}

function loadAll(): {[id: string]: BusinessProfile} {
  ensureDataDir();
  try {
    const raw = fs.readFileSync(BUSINESSES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to read businesses file', err);
    return {};
  }
}

function saveAll(data: {[id: string]: BusinessProfile}) {
  ensureDataDir();
  fs.writeFileSync(BUSINESSES_FILE, JSON.stringify(data, null, 2), 'utf8');
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

// List businesses
app.get('/businesses', (_req, res) => {
  const all = loadAll();
  res.json({businesses: Object.values(all), ts: new Date().toISOString()});
});

// Get a single business
app.get('/businesses/:id', (req, res) => {
  const id = req.params.id;
  const all = loadAll();
  const b = all[id];
  if (!b) return res.status(404).json({error: 'Business not found'});
  res.json({business: b, ts: new Date().toISOString()});
});

// Create or update a business
app.post('/businesses', (req, res) => {
  const body = req.body as BusinessProfile;
  if (!body || !body.id || !body.name) return res.status(400).json({error: 'Missing id or name'});
  const all = loadAll();
  all[body.id] = body;
  saveAll(all);
  res.json({business: body, ts: new Date().toISOString()});
});

app.put('/businesses/:id', (req, res) => {
  const id = req.params.id;
  const body = req.body as Partial<BusinessProfile>;
  const all = loadAll();
  const existing = all[id];
  if (!existing) return res.status(404).json({error: 'Business not found'});
  const updated = {...existing, ...body};
  all[id] = updated as BusinessProfile;
  saveAll(all);
  res.json({business: updated, ts: new Date().toISOString()});
});

app.delete('/businesses/:id', (req, res) => {
  const id = req.params.id;
  const all = loadAll();
  if (!all[id]) return res.status(404).json({error: 'Business not found'});
  delete all[id];
  saveAll(all);
  res.json({deleted: id, ts: new Date().toISOString()});
});

app.listen(PORT, () => {
  console.log(`Business Context Agent listening on http://localhost:${PORT}`);
});

// If run directly with ts-node-dev, no export needed; consumers can call HTTP endpoints.
