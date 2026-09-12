#!/usr/bin/env node
/**
 * Quick smoke test for the payment flow:
 * Sends an invoice intent to automationAgent → Stripe connector → Payment agent
 */

const baseUrl = 'http://localhost:3200/process';

const payload = {
  business_id: 'hvac-plumbing-pro',
  intent: {
    type: 'invoice',
    payload: {
      amount_cents: 15000, // $150
      description: 'HVAC Service - Emergency repair',
      customer_email: 'john.doe@example.com'
    }
  },
  caller: 'John Doe'
};

console.log('Testing payment flow...');
console.log(`POST ${baseUrl}`);
console.log(`Payload:`, JSON.stringify(payload, null, 2));

try {
  const resp = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const json = await resp.json();
  console.log('\n✓ Response received:');
  console.log(JSON.stringify(json, null, 2));

  if (json.action === 'invoice_created') {
    console.log('\n✅ Payment flow working:');
    console.log(`  - Invoice ID: ${json.invoice?.id}`);
    console.log(`  - Amount: $${json.invoice?.amount_due / 100}`);
    console.log(`  - Payment Link: ${json.payment_link?.substring(0, 50)}...`);
    console.log(`  - Payment recorded: ${json.payment_record ? 'yes' : 'no'}`);
  } else {
    console.log('\n❌ Unexpected response:', json);
  }
} catch (err) {
  console.error('\n❌ Error:', err.message);
  process.exit(1);
}
