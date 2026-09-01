async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, ok: response.ok, body };
}

async function main() {
  const broker = await fetchJson('http://localhost:3960/health');
  const automation = await fetchJson('http://localhost:3961/health');

  if (!broker.ok || !automation.ok) {
    throw new Error(`Health check failed: broker=${broker.status}, automation=${automation.status}`);
  }

  const draftResponse = await fetchJson('http://localhost:3961/campaigns/draft', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: 'hvac-plumbing-pro',
      platforms: ['linkedin', 'x'],
      topic: 'Seasonal HVAC maintenance reminder',
      goal: 'Drive booked tune-ups before peak season',
      cta: 'Book your maintenance visit today',
      approval_required: true,
    }),
  });

  if (!draftResponse.ok) {
    throw new Error(`Draft creation failed: ${JSON.stringify(draftResponse.body)}`);
  }

  const drafts = draftResponse.body?.drafts || [];
  if (drafts.length < 1) {
    throw new Error('No drafts were created');
  }

  const firstDraft = drafts[0];
  const reviewResponse = await fetchJson(`http://localhost:3961/businesses/hvac-plumbing-pro/drafts/${firstDraft.id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ brand_approved: true, legal_approved: true }),
  });

  if (!reviewResponse.ok || reviewResponse.body?.draft?.approval_status !== 'approved') {
    throw new Error(`Review failed: ${JSON.stringify(reviewResponse.body)}`);
  }

  const scheduleResponse = await fetchJson(`http://localhost:3961/businesses/hvac-plumbing-pro/drafts/${firstDraft.id}/schedule`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
  });

  if (!scheduleResponse.ok || scheduleResponse.body?.draft?.status !== 'scheduled') {
    throw new Error(`Scheduling failed: ${JSON.stringify(scheduleResponse.body)}`);
  }

  const publishResponse = await fetchJson(`http://localhost:3961/businesses/hvac-plumbing-pro/drafts/${firstDraft.id}/publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: 'hvac-plumbing-pro' }),
  });

  if (!publishResponse.ok) {
    throw new Error(`Publish call failed: ${JSON.stringify(publishResponse.body)}`);
  }

  if (publishResponse.body?.publish_result?.status !== 'deferred') {
    throw new Error(`Expected deferred publish without tokens: ${JSON.stringify(publishResponse.body)}`);
  }

  const queueResponse = await fetchJson('http://localhost:3961/businesses/hvac-plumbing-pro/queue');
  if (!queueResponse.ok || !Array.isArray(queueResponse.body?.drafts)) {
    throw new Error(`Queue query failed: ${JSON.stringify(queueResponse.body)}`);
  }

  const summary = {
    status: 'PASS',
    ts: new Date().toISOString(),
    broker: broker.body,
    automation: automation.body,
    campaign_id: draftResponse.body.campaign_id,
    publish_status: publishResponse.body.publish_result.status,
    draft_totals: queueResponse.body.totals,
  };

  console.log(JSON.stringify(summary, null, 2));
  console.log('Social validation passed.');
}

main().catch((error) => {
  console.error('Social validation failed.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
