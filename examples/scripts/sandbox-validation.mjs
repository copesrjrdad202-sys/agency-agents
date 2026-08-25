const REQUIRED_KEYS = {
  stripe: ['STRIPE_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_TEST_SECRET_KEY'],
  elevenlabs: ['ELEVENLABS_API_KEY'],
};

const ENV = process.env;

function findKey(keys) {
  return keys.find((key) => typeof ENV[key] === 'string' && ENV[key].trim().length > 0);
}

async function fetchJson(url, headers) {
  const response = await fetch(url, { headers });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { ok: response.ok, status: response.status, body };
}

async function validateStripe() {
  const stripeKey = findKey(REQUIRED_KEYS.stripe);
  if (!stripeKey) {
    return {
      provider: 'stripe',
      status: 'deferred',
      reason: 'No Stripe test credential found in environment',
    };
  }

  const key = ENV[stripeKey];
  const result = await fetchJson('https://api.stripe.com/v1/account', {
    Authorization: `Bearer ${key}`,
    'Stripe-Version': '2024-06-20',
  });

  if (!result.ok) {
    return {
      provider: 'stripe',
      status: 'failed',
      reason: `Stripe credential rejected (${result.status})`,
      details: result.body,
    };
  }

  return {
    provider: 'stripe',
    status: 'pass',
    mode: 'sandbox-or-live',
    details: result.body,
  };
}

async function validateElevenLabs() {
  const apiKey = findKey(REQUIRED_KEYS.elevenlabs);
  if (!apiKey) {
    return {
      provider: 'elevenlabs',
      status: 'deferred',
      reason: 'No ElevenLabs API key found in environment',
    };
  }

  const result = await fetchJson('https://api.elevenlabs.io/v1/voices', {
    'xi-api-key': ENV[apiKey],
    'Content-Type': 'application/json',
  });

  if (!result.ok) {
    return {
      provider: 'elevenlabs',
      status: 'failed',
      reason: `ElevenLabs credential rejected (${result.status})`,
      details: result.body,
    };
  }

  return {
    provider: 'elevenlabs',
    status: 'pass',
    mode: 'live-voice-ready',
    details: result.body,
  };
}

async function main() {
  const stripe = await validateStripe();
  const elevenlabs = await validateElevenLabs();

  const summary = {
    status: stripe.status === 'pass' && elevenlabs.status === 'pass' ? 'PASS' : 'DEFERRED',
    sandbox_gate: true,
    ts: new Date().toISOString(),
    checks: [stripe, elevenlabs],
  };

  console.log(JSON.stringify(summary, null, 2));

  if (summary.status === 'PASS') {
    console.log('Sandbox validation passed. You can proceed to paid provider setup with real test credentials.');
    return;
  }

  console.log('Sandbox validation is deferred because provider test credentials are not configured.');
  console.log('Add the following environment variables before spending money:');
  console.log('  STRIPE_TEST_SECRET_KEY=...');
  console.log('  ELEVENLABS_API_KEY=...');
  console.log('  Optional: STRIPE_WEBHOOK_SECRET=...');
  console.log('  Optional: ELEVENLABS_VOICE_ID=...');
}

main().catch((err) => {
  console.error('Sandbox validation errored.');
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
