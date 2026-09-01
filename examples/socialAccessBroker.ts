import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { getBusiness } from './persistentDb';
import {
  appendSocialAudit,
  listSocialAudits,
  listSocialTokens,
  revokeSocialToken,
  upsertSocialToken,
  type SocialPlatform,
  type SocialScope,
} from './socialStore';

dotenv.config();

const PORT = Number(process.env.SOCIAL_ACCESS_BROKER_PORT || 3960);

type TokenTemplate = {
  platform: SocialPlatform;
  scope: SocialScope;
  secretName: string;
};

const TOKEN_TEMPLATES: TokenTemplate[] = [
  { platform: 'x', scope: 'read', secretName: 'SOCIAL_X_READ_TOKEN' },
  { platform: 'x', scope: 'write', secretName: 'SOCIAL_X_WRITE_TOKEN' },
  { platform: 'x', scope: 'publish', secretName: 'SOCIAL_X_WRITE_TOKEN' },
  { platform: 'x', scope: 'analytics', secretName: 'SOCIAL_ANALYTICS_READ_TOKEN' },
  { platform: 'linkedin', scope: 'write', secretName: 'SOCIAL_LINKEDIN_WRITE_TOKEN' },
  { platform: 'linkedin', scope: 'publish', secretName: 'SOCIAL_LINKEDIN_WRITE_TOKEN' },
  { platform: 'linkedin', scope: 'analytics', secretName: 'SOCIAL_ANALYTICS_READ_TOKEN' },
  { platform: 'instagram', scope: 'write', secretName: 'SOCIAL_INSTAGRAM_WRITE_TOKEN' },
  { platform: 'instagram', scope: 'publish', secretName: 'SOCIAL_INSTAGRAM_WRITE_TOKEN' },
  { platform: 'instagram', scope: 'analytics', secretName: 'SOCIAL_ANALYTICS_READ_TOKEN' },
  { platform: 'tiktok', scope: 'write', secretName: 'SOCIAL_TIKTOK_WRITE_TOKEN' },
  { platform: 'tiktok', scope: 'publish', secretName: 'SOCIAL_TIKTOK_WRITE_TOKEN' },
  { platform: 'tiktok', scope: 'analytics', secretName: 'SOCIAL_ANALYTICS_READ_TOKEN' },
  { platform: 'reddit', scope: 'write', secretName: 'SOCIAL_REDDIT_WRITE_TOKEN' },
  { platform: 'reddit', scope: 'publish', secretName: 'SOCIAL_REDDIT_WRITE_TOKEN' },
  { platform: 'reddit', scope: 'analytics', secretName: 'SOCIAL_ANALYTICS_READ_TOKEN' },
  { platform: 'youtube', scope: 'write', secretName: 'SOCIAL_YOUTUBE_WRITE_TOKEN' },
  { platform: 'youtube', scope: 'publish', secretName: 'SOCIAL_YOUTUBE_WRITE_TOKEN' },
  { platform: 'youtube', scope: 'analytics', secretName: 'SOCIAL_ANALYTICS_READ_TOKEN' },
  { platform: 'facebook', scope: 'write', secretName: 'SOCIAL_META_ADS_TOKEN' },
  { platform: 'facebook', scope: 'publish', secretName: 'SOCIAL_META_ADS_TOKEN' },
  { platform: 'facebook', scope: 'ads', secretName: 'SOCIAL_META_ADS_TOKEN' },
  { platform: 'facebook', scope: 'analytics', secretName: 'SOCIAL_ANALYTICS_READ_TOKEN' },
];

const app = express();
app.use(bodyParser.json());

function isConfigured(secretName: string): boolean {
  const value = process.env[secretName];
  return Boolean(value && value.trim().length > 0);
}

function getTemplate(platform: SocialPlatform, scope: SocialScope): TokenTemplate | null {
  return TOKEN_TEMPLATES.find((template) => template.platform === platform && template.scope === scope) || null;
}

function getScopeStatus() {
  return TOKEN_TEMPLATES.map((template) => ({
    platform: template.platform,
    scope: template.scope,
    secret_name: template.secretName,
    configured: isConfigured(template.secretName),
  }));
}

function resolveTokenValue(secretName: string): string | null {
  const value = process.env[secretName];
  return value && value.trim().length > 0 ? value : null;
}

function listRedactedTokens(businessId?: string) {
  return listSocialTokens(businessId).map((token) => ({
    ...token,
    secret_name: token.secret_name,
    status: token.status,
  }));
}

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: 'social-access-broker',
    ts: new Date().toISOString(),
    scopes: getScopeStatus(),
  });
});

app.get('/social/scopes', (_req, res) => {
  res.json({ scopes: getScopeStatus(), ts: new Date().toISOString() });
});

app.get('/social/tokens', (req, res) => {
  const businessId = String(req.query.business_id || '');
  res.json({ tokens: listRedactedTokens(businessId || undefined), ts: new Date().toISOString() });
});

app.post('/social/tokens/register', (req, res) => {
  try {
    const { business_id, platform, scope, secret_name, environment = 'local', label } = req.body || {};
    if (!business_id || !platform || !scope || !secret_name) {
      return res.status(400).json({ error: 'business_id, platform, scope, and secret_name are required' });
    }
    const business = getBusiness(business_id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    const template = getTemplate(platform, scope);
    if (!template) {
      return res.status(400).json({ error: 'Unsupported platform/scope combination' });
    }

    const token = upsertSocialToken({
      business_id,
      platform,
      scope,
      environment,
      secret_name,
      label,
      status: 'active',
    });

    appendSocialAudit({
      business_id,
      actor: 'social-access-broker',
      action: 'register_token',
      platform,
      status: 'ok',
      message: `Registered ${platform}/${scope} token reference`,
      metadata: { secret_name, configured: String(isConfigured(secret_name)) },
    });

    res.status(201).json({ token, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.post('/social/tokens/revoke', (req, res) => {
  try {
    const { business_id, token_id } = req.body || {};
    if (!business_id || !token_id) {
      return res.status(400).json({ error: 'business_id and token_id are required' });
    }
    const revoked = revokeSocialToken(business_id, token_id);
    if (!revoked) {
      return res.status(404).json({ error: 'Token not found' });
    }
    appendSocialAudit({
      business_id,
      actor: 'social-access-broker',
      action: 'revoke_token',
      platform: revoked.platform,
      status: 'ok',
      message: `Revoked ${revoked.platform}/${revoked.scope} token`,
      metadata: { token_id },
    });
    res.json({ token: revoked, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.post('/social/publish', (req, res) => {
  try {
    const { business_id, platform, content, approval_status, draft_id, scheduled_for, scope = 'publish' } = req.body || {};
    if (!business_id || !platform || !content) {
      return res.status(400).json({ error: 'business_id, platform, and content are required' });
    }
    const business = getBusiness(business_id);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (approval_status !== 'approved') {
      appendSocialAudit({
        business_id,
        actor: 'social-access-broker',
        action: 'publish_blocked',
        platform,
        status: 'blocked',
        message: 'Publish blocked because approval_status is not approved',
        metadata: { draft_id: draft_id || '', approval_status: approval_status || '' },
      });
      return res.status(403).json({ status: 'blocked', reason: 'approval_required', ts: new Date().toISOString() });
    }

    const template = getTemplate(platform, scope);
    if (!template) {
      return res.status(400).json({ error: 'Unsupported platform/scope combination' });
    }

    const secretValue = resolveTokenValue(template.secretName);
    const mode = secretValue ? 'live-ready' : 'mock';
    const postId = `${platform}-${Date.now()}`;
    const audit = appendSocialAudit({
      business_id,
      actor: 'social-access-broker',
      action: 'publish',
      platform,
      status: secretValue ? 'ok' : 'deferred',
      message: secretValue
        ? `Publish routed for ${platform}`
        : `No configured token for ${template.secretName}; publish deferred`,
      metadata: {
        secret_name: template.secretName,
        draft_id: draft_id || '',
        scheduled_for: scheduled_for || '',
        mode,
      },
    });

    if (!secretValue) {
      return res.status(202).json({
        status: 'deferred',
        mode,
        platform,
        business_id,
        audit_log_id: audit.id,
        required_secret: template.secretName,
        ts: new Date().toISOString(),
      });
    }

    return res.json({
      status: 'queued',
      mode,
      platform,
      business_id,
      post_id: postId,
      audit_log_id: audit.id,
      ts: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.get('/social/audit', (req, res) => {
  const businessId = String(req.query.business_id || '');
  res.json({ audits: listSocialAudits(businessId || undefined), ts: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Social Access Broker listening on http://localhost:${PORT}`);
});
