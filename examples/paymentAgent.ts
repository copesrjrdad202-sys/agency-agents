import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { listPayments, upsertPayment } from './persistentDb';

dotenv.config();
const PORT = process.env.PAYMENT_AGENT_PORT || 3600;

interface PaymentRecord {
  id: string;
  invoice_id: string;
  business_id: string;
  amount_cents: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  payment_method: string;
  recorded_at: string;
  reference?: string; // Stripe transaction ID, check number, etc.
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString()}));

// Record a payment
app.post(['/payments', '/businesses/:business_id/payments'], (req, res) => {
  const {invoice_id, amount_cents, payment_method = 'stripe', reference} = req.body;
  const business_id = req.body.business_id || req.params.business_id;
  if (!invoice_id || !business_id || !amount_cents) return res.status(400).json({error: 'Missing required fields'});

  const id = `pay-${Date.now()}`;
  const payment: PaymentRecord = {
    id,
    invoice_id,
    business_id,
    amount_cents,
    status: 'completed',
    payment_method,
    recorded_at: new Date().toISOString(),
    reference
  };

  upsertPayment(payment);
  console.log(`Payment recorded: ${id} for invoice ${invoice_id}`);
  res.json({payment, ts: new Date().toISOString()});
});

// Get payment
app.get('/payments/:id', (req, res) => {
  const pay = listPayments().find((item) => item.id === req.params.id);
  if (!pay) return res.status(404).json({error: 'Payment not found'});
  res.json({payment: pay, ts: new Date().toISOString()});
});

// List payments for a business
app.get('/businesses/:business_id/payments', (req, res) => {
  const business_id = req.params.business_id;
  const list = listPayments(business_id);
  res.json({payments: list, ts: new Date().toISOString()});
});

// Stripe webhook handler (mock)
app.post('/webhooks/stripe', (req, res) => {
  const {type, data} = req.body;
  if (type === 'charge.succeeded') {
    const {id, amount, invoice} = data;
    const payment: PaymentRecord = {
      id: `pay-${Date.now()}`,
      invoice_id: invoice,
      business_id: req.body.business_id || 'unknown-business',
      amount_cents: amount,
      status: 'completed',
      payment_method: 'stripe',
      recorded_at: new Date().toISOString(),
      reference: id
    };
    upsertPayment(payment);
    console.log(`Stripe webhook: charge.succeeded for invoice ${invoice}, amount ${amount}`);
  }
  res.json({received: true, ts: new Date().toISOString()});
});

app.listen(PORT, () => console.log(`Payment Agent listening on http://localhost:${PORT}`));
