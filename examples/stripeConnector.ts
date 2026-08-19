import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';

dotenv.config();
const PORT = process.env.STRIPE_CONNECTOR_PORT || 3500;

// Minimal Stripe mock for prototype. In production, call stripe.com API directly.
// Usage: POST /invoices with {amount_cents, currency, description, metadata}
//        Returns a payment link and invoice object

interface StripeInvoice {
  id: string;
  amount_cents: number;
  currency: string;
  description: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  payment_link?: string;
  created: number;
  metadata?: Record<string, string>;
}

// Mock in-memory store (replace with actual Stripe API calls in production)
const invoices: {[id: string]: StripeInvoice} = {};

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString(), provider: 'stripe-mock'}));

// Create invoice with payment link
app.post('/invoices', (req, res) => {
  const {amount_cents, currency = 'usd', description = '', metadata = {}} = req.body;
  if (!amount_cents) return res.status(400).json({error: 'Missing amount_cents'});

  const id = `in_${Date.now()}`;
  const paymentLink = `https://checkout.stripe.com/pay/${id}`;
  const invoice: StripeInvoice = {
    id,
    amount_cents,
    currency,
    description,
    status: 'draft',
    payment_link: paymentLink,
    created: Date.now(),
    metadata
  };

  invoices[id] = invoice;
  console.log(`Stripe invoice created: ${id} for ${amount_cents} ${currency}`);
  res.json({invoice, ts: new Date().toISOString()});
});

// Get invoice
app.get('/invoices/:id', (req, res) => {
  const inv = invoices[req.params.id];
  if (!inv) return res.status(404).json({error: 'Stripe invoice not found'});
  res.json({invoice: inv, ts: new Date().toISOString()});
});

// Simulate payment (in production: webhook from Stripe)
app.post('/invoices/:id/pay', (req, res) => {
  const inv = invoices[req.params.id];
  if (!inv) return res.status(404).json({error: 'Stripe invoice not found'});
  inv.status = 'paid';
  console.log(`Stripe invoice ${req.params.id} marked paid`);
  res.json({invoice: inv, ts: new Date().toISOString()});
});

// Mock webhook endpoint for Stripe events (in production: real webhooks)
app.post('/webhooks/stripe', (req, res) => {
  const {type, data} = req.body;
  console.log(`Stripe webhook received: ${type}`, data);
  res.json({received: true, ts: new Date().toISOString()});
});

app.listen(PORT, () => console.log(`Stripe Connector (mock) listening on http://localhost:${PORT}`));
