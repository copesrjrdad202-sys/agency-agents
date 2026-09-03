import express from 'express';
import bodyParser from 'body-parser';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { getInvoice, upsertInvoice, upsertPayment } from './persistentDb';

dotenv.config();
const PORT = process.env.STRIPE_CONNECTOR_PORT || 3500;
const STRIPE_API_KEY = process.env.STRIPE_API_KEY;

if (!STRIPE_API_KEY) {
  console.warn('Warning: STRIPE_API_KEY not set. Stripe routes will return deferred responses until it is configured.');
  console.warn('Get a Stripe API key from https://dashboard.stripe.com/apikeys');
}

const stripe = STRIPE_API_KEY ? new Stripe(STRIPE_API_KEY) : null;

type LocalInvoice = {
  id: string;
  business_id?: string;
  status: 'draft' | 'open' | 'paid' | 'void';
  amount_due: number;
  currency: string;
  customer_email: string;
  description: string;
  metadata: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  ts: new Date().toISOString(),
  provider: 'stripe-live',
  configured: Boolean(stripe),
}));

// Create invoice and return payment link
async function createInvoiceHandler(req: any, res: any) {
  if (!stripe) {
    return res.status(503).json({
      status: 'deferred',
      error: 'STRIPE_API_KEY not configured',
      ts: new Date().toISOString(),
    });
  }
  try {
    const {amount_cents, currency = 'usd', description = '', customer_email, business_id, metadata = {}} = req.body;
    if (!amount_cents) return res.status(400).json({error: 'Missing amount_cents'});

    const invoiceId = `inv_${crypto.randomUUID().replace(/-/g, '')}`;
    const invoice: LocalInvoice = {
      id: invoiceId,
      business_id: business_id || metadata.business_id || 'unknown-business',
      status: 'draft',
      amount_due: amount_cents,
      currency,
      customer_email: customer_email || 'customer@example.com',
      description,
      metadata,
      created_at: new Date().toISOString(),
    };
    upsertInvoice(invoice);

    // Create a payment link for this invoice
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: description || 'Service',
              metadata
            },
            unit_amount: amount_cents
          },
          quantity: 1
        }
      ],
      after_completion: {type: 'redirect', redirect: {url: 'https://example.com/thank-you'}},
      metadata: {invoice_id: invoiceId}
    });

    console.log(`Stripe invoice created: ${invoiceId}, Payment link: ${paymentLink.url}`);
    res.json({invoice, payment_link: paymentLink.url, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('Stripe invoice creation failed:', err.message);
    res.status(500).json({error: err.message});
  }
}

app.post(['/invoices', '/stripe/invoices'], createInvoiceHandler);

// Get invoice details
app.get(['/invoices/:id', '/stripe/invoices/:id'], async (req, res) => {
  try {
    const invoice = getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({error: 'Stripe invoice not found'});
    }
    res.json({invoice, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(404).json({error: 'Stripe invoice not found'});
  }
});

// Finalize and send invoice
app.post(['/invoices/:id/finalize-and-send', '/stripe/invoices/:id/finalize-and-send'], async (req, res) => {
  try {
    const invoice = getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({error: 'Stripe invoice not found'});
    }
    invoice.status = 'open';
    upsertInvoice(invoice);
    console.log(`Stripe invoice ${req.params.id} finalized and sent`);
    res.json({invoice, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('Failed to finalize/send invoice:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Mark invoice as paid (useful for testing or manual payments)
app.post(['/invoices/:id/mark-paid', '/stripe/invoices/:id/mark-paid'], async (req, res) => {
  try {
    const invoice = getInvoice(req.params.id);
    if (!invoice) {
      return res.status(404).json({error: 'Stripe invoice not found'});
    }
    invoice.status = 'paid';
    invoice.paid_at = new Date().toISOString();
    upsertInvoice(invoice);
    console.log(`Stripe invoice ${req.params.id} marked paid`);
    res.json({invoice, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(500).json({error: err.message});
  }
});

// Webhook handler for Stripe events (charge.succeeded, payment_intent.succeeded, etc.)
app.post(['/webhooks', '/stripe/webhooks'], bodyParser.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe) {
    return res.status(503).json({
      status: 'deferred',
      error: 'STRIPE_API_KEY not configured',
      ts: new Date().toISOString(),
    });
  }

  if (!webhookSecret) {
    console.warn('STRIPE_WEBHOOK_SECRET not set; skipping signature verification');
    const event = JSON.parse((req as any).body.toString());
    console.log(`Stripe webhook received: ${event.type}`);
    res.json({received: true, ts: new Date().toISOString()});
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent((req as any).body, sig, webhookSecret);
    console.log(`Stripe webhook verified: ${event.type}`);

    // Handle different event types
    if (event.type === 'charge.succeeded') {
      const charge = event.data.object as any;
      console.log(`Charge succeeded: ${charge.id} for $${charge.amount / 100}`);
      upsertPayment({
        id: `pay_${charge.id}`,
        invoice_id: charge.invoice || charge.metadata?.invoice_id || 'unknown-invoice',
        business_id: charge.metadata?.business_id || 'unknown-business',
        amount_cents: charge.amount,
        status: 'completed',
        payment_method: 'stripe',
        recorded_at: new Date().toISOString(),
        reference: charge.id,
      });
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;
      console.log(`Invoice paid: ${invoice.id}`);
      const existing = getInvoice(invoice.id);
      upsertInvoice({
        ...(existing || {
          id: invoice.id,
          business_id: invoice.metadata?.business_id || 'unknown-business',
          amount_due: invoice.amount_paid || invoice.amount_due || 0,
          currency: invoice.currency || 'usd',
          customer_email: invoice.customer_email || 'customer@example.com',
          description: invoice.description || 'Stripe invoice',
          metadata: invoice.metadata || {},
        }),
        status: 'paid',
        paid_at: new Date().toISOString(),
      });
    }

    res.json({received: true, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({error: 'Webhook signature verification failed'});
  }
});

app.listen(PORT, () => console.log(`Stripe Connector (live API) listening on http://localhost:${PORT}`));
