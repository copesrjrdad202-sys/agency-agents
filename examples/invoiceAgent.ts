import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { getInvoice, listInvoices, upsertInvoice } from './persistentDb';

dotenv.config();
const PORT = process.env.INVOICE_AGENT_PORT || 3400;

interface Invoice {
  id: string;
  business_id: string;
  amount_cents: number;
  description: string;
  status: 'draft' | 'sent' | 'paid' | 'cancelled';
  created_at: string;
  due_date?: string;
  customer_email?: string;
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

// Create invoice
app.post('/invoices', (req, res) => {
  const {business_id, amount_cents, description, due_date, customer_email} = req.body;
  if (!business_id || !amount_cents) return res.status(400).json({error: 'Missing business_id or amount_cents'});

  const id = `inv-${Date.now()}`;
  const invoice: Invoice = {
    id,
    business_id,
    amount_cents,
    description: description || '',
    status: 'draft',
    created_at: new Date().toISOString(),
    due_date,
    customer_email
  };

  upsertInvoice({
    id,
    business_id,
    amount_due: amount_cents,
    currency: 'usd',
    customer_email: customer_email || 'customer@example.com',
    description: description || '',
    status: 'draft',
    metadata: { source: 'invoice-agent' },
    due_date,
    created_at: invoice.created_at,
  });
  console.log(`Invoice created: ${id}`);
  res.json({invoice, ts: new Date().toISOString()});
});

// Get invoice
app.get('/invoices/:id', (req, res) => {
  const inv = getInvoice(req.params.id);
  if (!inv) return res.status(404).json({error: 'Invoice not found'});
  res.json({invoice: inv, ts: new Date().toISOString()});
});

// Update invoice status (e.g., mark as sent, paid)
app.patch('/invoices/:id', (req, res) => {
  const {status} = req.body;
  const inv = getInvoice(req.params.id);
  if (!inv) return res.status(404).json({error: 'Invoice not found'});
  if (status && ['draft', 'sent', 'paid', 'cancelled'].includes(status)) {
    inv.status = status;
    console.log(`Invoice ${req.params.id} marked ${status}`);
    upsertInvoice(inv);
  }
  res.json({invoice: inv, ts: new Date().toISOString()});
});

// List invoices for a business
app.get('/businesses/:business_id/invoices', (req, res) => {
  const business_id = req.params.business_id;
  const list = listInvoices(business_id);
  res.json({invoices: list, ts: new Date().toISOString()});
});

app.listen(PORT, () => console.log(`Invoice Agent listening on http://localhost:${PORT}`));
