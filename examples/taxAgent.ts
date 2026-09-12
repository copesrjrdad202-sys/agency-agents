import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { loadTaxSheet, recordTaxIncome } from './persistentDb';

dotenv.config();
const PORT = process.env.TAX_AGENT_PORT || 3700;

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

// Record a paid invoice to the tax ledger
app.post('/businesses/:business_id/record-income', (req, res) => {
  const {invoice_id, amount_cents} = req.body;
  const business_id = req.params.business_id;

  if (!invoice_id || !amount_cents) return res.status(400).json({error: 'Missing invoice_id or amount_cents'});

  const result = recordTaxIncome(business_id, invoice_id, amount_cents);

  console.log(`Tax entry recorded for ${business_id}: invoice ${invoice_id}, amount ${amount_cents}`);
  res.json({entry: result.entry, sheet: result.sheet, ts: new Date().toISOString()});
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
