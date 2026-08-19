import express from 'express';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();
const PORT = process.env.TAX_AGENT_PORT || 3700;
const DATA_DIR = path.join(__dirname, 'data');

interface TaxEntry {
  id: string;
  business_id: string;
  invoice_id: string;
  amount_cents: number;
  recorded_at: string;
}

interface TaxSheet {
  business_id: string;
  entries: TaxEntry[];
  total_income_cents: number;
  last_updated: string;
}

function getTaxSheetPath(business_id: string): string {
  return path.join(DATA_DIR, `tax-sheet-${business_id}.json`);
}

function loadTaxSheet(business_id: string): TaxSheet {
  const p = getTaxSheetPath(business_id);
  if (fs.existsSync(p)) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (err) {
      console.error(`Failed to read tax sheet for ${business_id}`, err);
    }
  }
  return {business_id, entries: [], total_income_cents: 0, last_updated: new Date().toISOString()};
}

function saveTaxSheet(sheet: TaxSheet): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, {recursive: true});
  const p = getTaxSheetPath(sheet.business_id);
  fs.writeFileSync(p, JSON.stringify(sheet, null, 2), 'utf8');
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

// Record a paid invoice to the tax ledger
app.post('/businesses/:business_id/record-income', (req, res) => {
  const {invoice_id, amount_cents} = req.body;
  const business_id = req.params.business_id;

  if (!invoice_id || !amount_cents) return res.status(400).json({error: 'Missing invoice_id or amount_cents'});

  const sheet = loadTaxSheet(business_id);
  const entry: TaxEntry = {
    id: `tax-${Date.now()}`,
    business_id,
    invoice_id,
    amount_cents,
    recorded_at: new Date().toISOString()
  };

  sheet.entries.push(entry);
  sheet.total_income_cents += amount_cents;
  sheet.last_updated = new Date().toISOString();
  saveTaxSheet(sheet);

  console.log(`Tax entry recorded for ${business_id}: invoice ${invoice_id}, amount ${amount_cents}`);
  res.json({entry, sheet, ts: new Date().toISOString()});
});

// Get tax summary for a business
app.get('/businesses/:business_id/tax-summary', (req, res) => {
  const business_id = req.params.business_id;
  const sheet = loadTaxSheet(business_id);
  res.json({
    business_id,
    total_income_cents: sheet.total_income_cents,
    total_income_dollars: (sheet.total_income_cents / 100).toFixed(2),
    num_entries: sheet.entries.length,
    last_updated: sheet.last_updated,
    ts: new Date().toISOString()
  });
});

// Get full tax sheet
app.get('/businesses/:business_id/tax-sheet', (req, res) => {
  const business_id = req.params.business_id;
  const sheet = loadTaxSheet(business_id);
  res.json({sheet, ts: new Date().toISOString()});
});

app.listen(PORT, () => console.log(`Tax Agent listening on http://localhost:${PORT}`));
