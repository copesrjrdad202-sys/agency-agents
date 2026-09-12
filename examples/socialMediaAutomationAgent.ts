import express from 'express';
import bodyParser from 'body-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import { getBusiness } from './persistentDb';
import {
  appendSocialAnalytics,
  appendSocialAudit,
  listDueSocialDrafts,
  listSocialAudits,
  listSocialDrafts,
  upsertSocialDraft,
  type SocialDraft,
  type SocialPlatform,
} from './socialStore';

dotenv.config();

const PORT = Number(process.env.SOCIAL_AUTOMATION_PORT || 3961);
const SOCIAL_ACCESS_BROKER_URL = process.env.SOCIAL_ACCESS_BROKER_URL || 'http://localhost:3960';

type CampaignInput = {
  business_id: string;
  campaign_id?: string;
  platform?: SocialPlatform;
  platforms?: SocialPlatform[];
  topic: string;
  goal: string;
  cta: string;
  source_urls?: string[];
  deadline?: string;
  brand_voice?: string;
  target_audience?: string;
  approval_required?: boolean;
};

type ReviewInput = {
  brand_approved?: boolean;
  legal_approved?: boolean;
  review_flags?: string[];
  note?: string;
};

const app = express();
app.use(bodyParser.json());

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function normalizePlatforms(input: CampaignInput): SocialPlatform[] {
  if (input.platforms && input.platforms.length > 0) {
    return input.platforms;
  }
  return [input.platform || 'linkedin'];
}

function buildHashtags(platform: SocialPlatform, businessName: string, topic: string): string[] {
  const base = [`#${slugify(businessName)}`, `#${slugify(topic)}`];
  const platformTags: Record<SocialPlatform, string[]> = {
    x: ['#social', '#growth'],
    linkedin: ['#B2B', '#leadership'],
    instagram: ['#smallbusiness', '#community'],
    tiktok: ['#shortform', '#localbusiness'],
    reddit: ['#community', '#discussion'],
    youtube: ['#shorts', '#brand'],
    facebook: ['#community', '#updates'],
  };
  return [...base, ...platformTags[platform]];
}

function buildPlatformDraft(platform: SocialPlatform, input: CampaignInput, businessName: string): Pick<SocialDraft, 'content' | 'hashtags' | 'review_flags'> {
  const topic = input.topic.trim();
  const goal = input.goal.trim();
  const cta = input.cta.trim();
  const voice = input.brand_voice?.trim() || 'clear, useful, and direct';
  const audience = input.target_audience?.trim();
  const sourceNote = input.source_urls && input.source_urls.length > 0 ? ` Source: ${input.source_urls[0]}` : '';
  const riskyClaims = /(\bguarantee\b|\bbest\b|\b#1\b|\bfree\b|\bmiracle\b)/i.test([topic, goal, cta].join(' '));

  let content = '';
  if (platform === 'linkedin') {
    content = `${businessName} insight: ${topic}.\n\n${goal}. ${audience ? `Built for ${audience}. ` : ''}${cta}.${sourceNote}`;
  } else if (platform === 'x') {
    content = `${topic} — ${goal}. ${cta}. ${sourceNote}`.trim();
  } else if (platform === 'instagram') {
    content = `${topic}\n\n${goal}\n\n${cta}\n\n${voice}.${sourceNote}`;
  } else if (platform === 'tiktok') {
    content = `${topic} | ${goal} | ${cta}${sourceNote}`.trim();
  } else if (platform === 'reddit') {
    content = `${topic}\n\nContext: ${goal}\n\nAsk: ${cta}${sourceNote}`.trim();
  } else if (platform === 'youtube') {
    content = `${topic} | ${goal} | ${cta}${sourceNote}`.trim();
  } else {
    content = `${topic} - ${goal} - ${cta}${sourceNote}`.trim();
  }

  const reviewFlags: string[] = [];
  if (riskyClaims) {
    reviewFlags.push('claim-risk');
  }
  if (input.source_urls && input.source_urls.length > 0) {
    reviewFlags.push('source-link-required');
  }
  if (content.length > 1000) {
    reviewFlags.push('length-risk');
  }

  return {
    content,
    hashtags: buildHashtags(platform, businessName, topic),
    review_flags: reviewFlags,
  };
}

function approvalStatusForDraft(brandApproved: boolean, legalApproved: boolean, reviewFlags: string[]): 'pending' | 'approved' | 'rejected' {
  if (reviewFlags.includes('claim-risk') && !legalApproved) {
    return 'pending';
  }
  if (brandApproved && legalApproved) {
    return 'approved';
  }
  if (!brandApproved || !legalApproved) {
    return 'pending';
  }
  return 'rejected';
}

function resolveBusinessId(req: express.Request): string {
  const businessId = String((req.params as any).businessId || req.body?.business_id || '').trim();
  return businessId;
}

function getDraftForRequest(req: express.Request, draftId: string): SocialDraft {
  const businessId = resolveBusinessId(req);
  if (!businessId) {
    throw new Error('business_id is required');
  }
  const draft = listSocialDrafts(businessId).find((item) => item.id === draftId);
  if (!draft) {
    throw new Error('Draft not found for business');
  }
  return draft;
}

async function routePublish(draft: SocialDraft) {
  const response = await axios.post(`${SOCIAL_ACCESS_BROKER_URL}/social/publish`, {
    business_id: draft.business_id,
    platform: draft.platform,
    content: draft.content,
    approval_status: draft.approval_status,
    draft_id: draft.id,
    scheduled_for: draft.scheduled_for,
    scope: 'publish',
  }, { timeout: 5000 });
  return response.data;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: 'social-media-automation', ts: new Date().toISOString() });
});

app.post('/campaigns/draft', (req, res) => {
  try {
    const body = req.body as CampaignInput;
    if (!body || !body.business_id || !body.topic || !body.goal || !body.cta) {
      return res.status(400).json({ error: 'business_id, topic, goal, and cta are required' });
    }

    const business = getBusiness(body.business_id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const campaignId = body.campaign_id || `cmp-${Date.now()}`;
    const platforms = normalizePlatforms(body);
    const drafts = platforms.map((platform) => {
      const built = buildPlatformDraft(platform, body, business.branding?.displayName || business.name);
      return upsertSocialDraft({
        business_id: body.business_id,
        campaign_id: campaignId,
        platform,
        topic: body.topic,
        goal: body.goal,
        cta: body.cta,
        content: built.content,
        hashtags: built.hashtags,
        source_urls: body.source_urls || [],
        approval_required: body.approval_required !== false,
        brand_approved: false,
        legal_approved: false,
        approval_status: 'pending',
        status: 'draft',
        review_flags: built.review_flags,
      });
    });

    const audit = appendSocialAudit({
      business_id: body.business_id,
      actor: 'social-media-automation-agent',
      action: 'draft_campaign',
      status: 'ok',
      message: `Created ${drafts.length} draft(s) for campaign ${campaignId}`,
      metadata: { campaign_id: campaignId, platforms: platforms.join(',') },
    });

    res.status(201).json({ campaign_id: campaignId, drafts, audit_log_id: audit.id, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.post(['/businesses/:businessId/drafts/:draftId/review', '/drafts/:draftId/review'], (req, res) => {
  try {
    const draftId = req.params.draftId;
    const body = req.body as ReviewInput;
    const existing = getDraftForRequest(req, draftId);

    const reviewFlags = body.review_flags || existing.review_flags;
    const brandApproved = body.brand_approved !== undefined ? body.brand_approved : existing.brand_approved;
    const legalApproved = body.legal_approved !== undefined ? body.legal_approved : existing.legal_approved;
    const approvalStatus = approvalStatusForDraft(brandApproved, legalApproved, reviewFlags);

    const updated = upsertSocialDraft({
      ...existing,
      brand_approved: brandApproved,
      legal_approved: legalApproved,
      review_flags: reviewFlags,
      approval_status: approvalStatus,
      status: approvalStatus === 'approved' ? 'approved' : 'needs_review',
    });

    const audit = appendSocialAudit({
      business_id: updated.business_id,
      actor: 'brand-guardian',
      action: 'review_draft',
      platform: updated.platform,
      status: approvalStatus === 'approved' ? 'ok' : 'blocked',
      message: body.note || `Reviewed draft ${draftId}`,
      metadata: { draft_id: draftId, brand_approved: String(brandApproved), legal_approved: String(legalApproved) },
    });

    res.json({ draft: updated, audit_log_id: audit.id, ts: new Date().toISOString() });
  } catch (error: any) {
    const status = /required|not found/i.test(error.message) ? 400 : 500;
    res.status(status).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.post(['/businesses/:businessId/drafts/:draftId/schedule', '/drafts/:draftId/schedule'], (req, res) => {
  try {
    const draftId = req.params.draftId;
    const scheduledFor = String(req.body?.scheduled_for || req.body?.scheduledFor || '');
    const existing = getDraftForRequest(req, draftId);

    if (existing.approval_status !== 'approved') {
      return res.status(403).json({ error: 'Draft must be approved before scheduling' });
    }

    const updated = upsertSocialDraft({
      ...existing,
      status: 'scheduled',
      scheduled_for: scheduledFor || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    const audit = appendSocialAudit({
      business_id: updated.business_id,
      actor: 'social-media-automation-agent',
      action: 'schedule_draft',
      platform: updated.platform,
      status: 'ok',
      message: `Scheduled draft ${draftId}`,
      metadata: { draft_id: draftId, scheduled_for: updated.scheduled_for || '' },
    });

    res.json({ draft: updated, audit_log_id: audit.id, ts: new Date().toISOString() });
  } catch (error: any) {
    const status = /required|not found/i.test(error.message) ? 400 : 500;
    res.status(status).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.post(['/businesses/:businessId/drafts/:draftId/publish', '/drafts/:draftId/publish'], async (req, res) => {
  try {
    const existing = getDraftForRequest(req, req.params.draftId);

    if (existing.approval_status !== 'approved') {
      return res.status(403).json({ error: 'Draft must be approved before publish' });
    }

    const routed = await routePublish(existing);
    const publishedAt = new Date().toISOString();
    const nextStatus = routed.status === 'deferred' ? 'deferred' : 'published';
    const updated = upsertSocialDraft({
      ...existing,
      status: nextStatus,
      publish_status: routed.status === 'deferred' ? 'deferred' : 'queued',
      platform_post_id: routed.post_id || existing.platform_post_id,
      published_at: routed.status === 'deferred' ? existing.published_at : publishedAt,
      audit_log_id: routed.audit_log_id || existing.audit_log_id,
    });

    appendSocialAnalytics({
      business_id: updated.business_id,
      platform: updated.platform,
      metric: 'publish_attempts',
      value: 1,
      draft_id: updated.id,
      post_id: routed.post_id,
    });

    res.json({ draft: updated, publish_result: routed, ts: new Date().toISOString() });
  } catch (error: any) {
    const draft = listSocialDrafts().find((item) => item.id === req.params.draftId);
    if (draft) {
      upsertSocialDraft({
        ...draft,
        status: 'failed',
        publish_status: 'failed',
      });
      appendSocialAudit({
        business_id: draft.business_id,
        actor: 'social-media-automation-agent',
        action: 'publish_failed',
        platform: draft.platform,
        status: 'error',
        message: error.message,
        metadata: { draft_id: draft.id },
      });
    }
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.post('/businesses/:businessId/publish-due', async (req, res) => {
  try {
    const dueDrafts = listDueSocialDrafts(req.params.businessId);
    const results = [];
    for (const draft of dueDrafts) {
      const routed = await routePublish(draft);
      const updated = upsertSocialDraft({
        ...draft,
        status: routed.status === 'deferred' ? 'deferred' : 'published',
        publish_status: routed.status === 'deferred' ? 'deferred' : 'queued',
        platform_post_id: routed.post_id || draft.platform_post_id,
        published_at: routed.status === 'deferred' ? draft.published_at : new Date().toISOString(),
        audit_log_id: routed.audit_log_id || draft.audit_log_id,
      });
      results.push({ draft: updated, publish_result: routed });
    }
    res.json({ business_id: req.params.businessId, results, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.get('/businesses/:businessId/queue', (req, res) => {
  const drafts = listSocialDrafts(req.params.businessId);
  res.json({
    business_id: req.params.businessId,
    drafts,
    totals: {
      draft: drafts.filter((d) => d.status === 'draft').length,
      needs_review: drafts.filter((d) => d.status === 'needs_review').length,
      approved: drafts.filter((d) => d.status === 'approved').length,
      scheduled: drafts.filter((d) => d.status === 'scheduled').length,
      published: drafts.filter((d) => d.status === 'published').length,
      deferred: drafts.filter((d) => d.status === 'deferred').length,
      failed: drafts.filter((d) => d.status === 'failed').length,
    },
    ts: new Date().toISOString(),
  });
});

app.get('/businesses/:businessId/audit', (req, res) => {
  const businessId = req.params.businessId;
  res.json({ audits: listSocialAudits(businessId), ts: new Date().toISOString() });
});

app.get('/businesses/:businessId/analytics', (req, res) => {
  const drafts = listSocialDrafts(req.params.businessId);
  const metrics = {
    drafts_created: drafts.length,
    approved: drafts.filter((d) => d.approval_status === 'approved').length,
    scheduled: drafts.filter((d) => d.status === 'scheduled').length,
    published: drafts.filter((d) => d.status === 'published').length,
    deferred: drafts.filter((d) => d.status === 'deferred').length,
    failed: drafts.filter((d) => d.status === 'failed').length,
  };
  res.json({ business_id: req.params.businessId, metrics, ts: new Date().toISOString() });
});

app.post('/businesses/:businessId/metrics', (req, res) => {
  try {
    const { platform, metric, value, draft_id, post_id } = req.body || {};
    if (!platform || !metric || value === undefined) {
      return res.status(400).json({ error: 'platform, metric, and value are required' });
    }
    const record = appendSocialAnalytics({
      business_id: req.params.businessId,
      platform,
      metric,
      value: Number(value),
      draft_id,
      post_id,
    });
    res.status(201).json({ metric: record, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.listen(PORT, () => {
  console.log(`Social Media Automation Agent listening on http://localhost:${PORT}`);
});
