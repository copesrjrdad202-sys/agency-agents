import express from 'express';
import bodyParser from 'body-parser';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();
const PORT = process.env.STRIPE_CONNECTOR_PORT || 3500;
const STRIPE_API_KEY = process.env.STRIPE_API_KEY;

if (!STRIPE_API_KEY) {
  console.error('Error: STRIPE_API_KEY not set in environment. Set it in .env or export it.');
  console.error('Get a Stripe API key from https://dashboard.stripe.com/apikeys');
  process.exit(1);
}

const stripe = new Stripe(STRIPE_API_KEY, {apiVersion: '2024-06-20'});

const app = express();
app.use(bodyParser.json());

app.get('/health', (_req, res) => res.json({status: 'ok', ts: new Date().toISOString(), provider: 'stripe-live'}));

// Create invoice and return payment link
app.post('/invoices', async (req, res) => {
  try {
    const {amount_cents, currency = 'usd', description = '', customer_email, metadata = {}} = req.body;
    if (!amount_cents) return res.status(400).json({error: 'Missing amount_cents'});

    // Create a Stripe invoice
    const invoice = await stripe.invoices.create({
      amount_due: amount_cents,
      currency,
      customer_email: customer_email || 'customer@example.com',
      description,
      metadata,
      auto_advance: false // don't send automatically
    });

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
      metadata: {invoice_id: invoice.id}
    });

    console.log(`Stripe invoice created: ${invoice.id}, Payment link: ${paymentLink.url}`);
    res.json({invoice: {id: invoice.id, status: invoice.status}, payment_link: paymentLink.url, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('Stripe invoice creation failed:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Get invoice details
app.get('/invoices/:id', async (req, res) => {
  try {
    const invoice = await stripe.invoices.retrieve(req.params.id);
    res.json({invoice, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(404).json({error: 'Stripe invoice not found'});
  }
});

// Finalize and send invoice
app.post('/invoices/:id/finalize-and-send', async (req, res) => {
  try {
    const invoice = await stripe.invoices.finalizeInvoice(req.params.id);
    const sent = await stripe.invoices.sendInvoice(req.params.id);
    console.log(`Stripe invoice ${req.params.id} finalized and sent`);
    res.json({invoice: sent, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('Failed to finalize/send invoice:', err.message);
    res.status(500).json({error: err.message});
  }
});

// Mark invoice as paid (useful for testing or manual payments)
app.post('/invoices/:id/mark-paid', async (req, res) => {
  try {
    const invoice = await stripe.invoices.update(req.params.id, {
      paid: true
    });
    console.log(`Stripe invoice ${req.params.id} marked paid`);
    res.json({invoice, ts: new Date().toISOString()});
  } catch (err: any) {
    res.status(500).json({error: err.message});
  }
});

// Webhook handler for Stripe events (charge.succeeded, payment_intent.succeeded, etc.)
app.post('/webhooks', bodyParser.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

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
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object as any;
      console.log(`Invoice paid: ${invoice.id}`);
    }

    res.json({received: true, ts: new Date().toISOString()});
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    res.status(400).json({error: 'Webhook signature verification failed'});
  }
});

app.listen(PORT, () => console.log(`Stripe Connector (live API) listening on http://localhost:${PORT}`));
