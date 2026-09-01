import fs from 'fs';
import path from 'path';

export type SocialPlatform = 'x' | 'linkedin' | 'instagram' | 'tiktok' | 'reddit' | 'youtube' | 'facebook';
export type SocialScope = 'read' | 'write' | 'publish' | 'ads' | 'analytics';
export type SocialDraftStatus = 'draft' | 'needs_review' | 'approved' | 'scheduled' | 'published' | 'rejected' | 'deferred' | 'failed';
export type SocialApprovalStatus = 'pending' | 'approved' | 'rejected';
export type SocialPublishStatus = 'queued' | 'published' | 'deferred' | 'failed';

export type SocialTokenRecord = {
  id: string;
  business_id: string;
  platform: SocialPlatform;
  scope: SocialScope;
  environment: 'dev' | 'staging' | 'prod' | 'local';
  secret_name: string;
  label?: string;
  status: 'active' | 'revoked';
  created_at: string;
  updated_at: string;
  revoked_at?: string;
};

export type SocialDraft = {
  id: string;
  business_id: string;
  campaign_id: string;
  platform: SocialPlatform;
  topic: string;
  goal: string;
  cta: string;
  content: string;
  hashtags: string[];
  source_urls: string[];
  approval_required: boolean;
  brand_approved: boolean;
  legal_approved: boolean;
  approval_status: SocialApprovalStatus;
  status: SocialDraftStatus;
  review_flags: string[];
  scheduled_for?: string;
  published_at?: string;
  platform_post_id?: string;
  publish_status?: SocialPublishStatus;
  audit_log_id?: string;
  created_at: string;
  updated_at: string;
};

export type SocialAuditEvent = {
  id: string;
  business_id: string;
  actor: string;
  action: string;
  platform?: SocialPlatform;
  status: 'ok' | 'blocked' | 'deferred' | 'error';
  message: string;
  metadata: Record<string, string>;
  created_at: string;
};

export type SocialAnalyticsEvent = {
  id: string;
  business_id: string;
  platform: SocialPlatform;
  metric: string;
  value: number;
  recorded_at: string;
  draft_id?: string;
  post_id?: string;
};

type SocialStore = {
  tokens: Record<string, SocialTokenRecord[]>;
  drafts: Record<string, SocialDraft[]>;
  audits: SocialAuditEvent[];
  analytics: Record<string, SocialAnalyticsEvent[]>;
  updatedAt: string;
};

const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'social-store.json');

function ensureStoreFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    const initial: SocialStore = {
      tokens: {},
      drafts: {},
      audits: [],
      analytics: {},
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readStore(): SocialStore {
  ensureStoreFile();
  const raw = fs.readFileSync(STORE_PATH, 'utf8');
  const parsed = JSON.parse(raw) as Partial<SocialStore>;
  return {
    tokens: parsed.tokens || {},
    drafts: parsed.drafts || {},
    audits: parsed.audits || [],
    analytics: parsed.analytics || {},
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  };
}

function writeStore(store: SocialStore) {
  ensureStoreFile();
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmpPath, STORE_PATH);
}

function bucketKey(businessId: string): string {
  return businessId;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

export function listSocialTokens(businessId?: string): SocialTokenRecord[] {
  const store = readStore();
  if (!businessId) {
    return Object.values(store.tokens).flat();
  }
  return store.tokens[bucketKey(businessId)] || [];
}

export function upsertSocialToken(token: Omit<SocialTokenRecord, 'id' | 'created_at' | 'updated_at' | 'status'> & Partial<Pick<SocialTokenRecord, 'id' | 'created_at' | 'updated_at' | 'status'>>): SocialTokenRecord {
  const store = readStore();
  const now = new Date().toISOString();
  const record: SocialTokenRecord = {
    id: token.id || makeId('token'),
    business_id: token.business_id,
    platform: token.platform,
    scope: token.scope,
    environment: token.environment,
    secret_name: token.secret_name,
    label: token.label,
    status: token.status || 'active',
    created_at: token.created_at || now,
    updated_at: now,
    revoked_at: token.status === 'revoked' ? now : undefined,
  };
  const bucket = store.tokens[bucketKey(record.business_id)] || [];
  const index = bucket.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    bucket[index] = record;
  } else {
    bucket.push(record);
  }
  store.tokens[bucketKey(record.business_id)] = bucket;
  store.updatedAt = now;
  writeStore(store);
  return record;
}

export function revokeSocialToken(businessId: string, tokenId: string): SocialTokenRecord | null {
  const store = readStore();
  const bucket = store.tokens[bucketKey(businessId)] || [];
  const token = bucket.find((item) => item.id === tokenId);
  if (!token) {
    return null;
  }
  token.status = 'revoked';
  token.updated_at = new Date().toISOString();
  token.revoked_at = token.updated_at;
  store.tokens[bucketKey(businessId)] = bucket;
  store.updatedAt = token.updated_at;
  writeStore(store);
  return token;
}

export function listSocialDrafts(businessId?: string): SocialDraft[] {
  const store = readStore();
  if (!businessId) {
    return Object.values(store.drafts).flat();
  }
  return store.drafts[bucketKey(businessId)] || [];
}

export function getSocialDraft(businessId: string, draftId: string): SocialDraft | null {
  const drafts = listSocialDrafts(businessId);
  return drafts.find((draft) => draft.id === draftId) || null;
}

export function upsertSocialDraft(draft: Omit<SocialDraft, 'id' | 'created_at' | 'updated_at'> & Partial<Pick<SocialDraft, 'id' | 'created_at' | 'updated_at'>>): SocialDraft {
  const store = readStore();
  const now = new Date().toISOString();
  const record: SocialDraft = {
    id: draft.id || makeId('draft'),
    business_id: draft.business_id,
    campaign_id: draft.campaign_id,
    platform: draft.platform,
    topic: draft.topic,
    goal: draft.goal,
    cta: draft.cta,
    content: draft.content,
    hashtags: draft.hashtags || [],
    source_urls: draft.source_urls || [],
    approval_required: draft.approval_required,
    brand_approved: draft.brand_approved,
    legal_approved: draft.legal_approved,
    approval_status: draft.approval_status,
    status: draft.status,
    review_flags: draft.review_flags || [],
    scheduled_for: draft.scheduled_for,
    published_at: draft.published_at,
    platform_post_id: draft.platform_post_id,
    publish_status: draft.publish_status,
    audit_log_id: draft.audit_log_id,
    created_at: draft.created_at || now,
    updated_at: now,
  };
  const bucket = store.drafts[bucketKey(record.business_id)] || [];
  const index = bucket.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    bucket[index] = record;
  } else {
    bucket.push(record);
  }
  store.drafts[bucketKey(record.business_id)] = bucket;
  store.updatedAt = now;
  writeStore(store);
  return record;
}

export function listDueSocialDrafts(businessId: string, at: Date = new Date()): SocialDraft[] {
  return listSocialDrafts(businessId).filter((draft) => {
    if (!draft.scheduled_for) {
      return false;
    }
    return draft.status === 'scheduled' && new Date(draft.scheduled_for).getTime() <= at.getTime();
  });
}

export function listApprovedSocialDrafts(businessId: string): SocialDraft[] {
  return listSocialDrafts(businessId).filter((draft) => draft.approval_status === 'approved');
}

export function listSocialAudits(businessId?: string): SocialAuditEvent[] {
  const store = readStore();
  return businessId ? store.audits.filter((audit) => audit.business_id === businessId) : store.audits;
}

export function appendSocialAudit(event: Omit<SocialAuditEvent, 'id' | 'created_at'> & Partial<Pick<SocialAuditEvent, 'id' | 'created_at'>>): SocialAuditEvent {
  const store = readStore();
  const now = new Date().toISOString();
  const record: SocialAuditEvent = {
    id: event.id || makeId('audit'),
    business_id: event.business_id,
    actor: event.actor,
    action: event.action,
    platform: event.platform,
    status: event.status,
    message: event.message,
    metadata: event.metadata || {},
    created_at: event.created_at || now,
  };
  store.audits.push(record);
  store.updatedAt = now;
  writeStore(store);
  return record;
}

export function appendSocialAnalytics(event: Omit<SocialAnalyticsEvent, 'id' | 'recorded_at'> & Partial<Pick<SocialAnalyticsEvent, 'id' | 'recorded_at'>>): SocialAnalyticsEvent {
  const store = readStore();
  const now = new Date().toISOString();
  const record: SocialAnalyticsEvent = {
    id: event.id || makeId('metric'),
    business_id: event.business_id,
    platform: event.platform,
    metric: event.metric,
    value: event.value,
    recorded_at: event.recorded_at || now,
    draft_id: event.draft_id,
    post_id: event.post_id,
  };
  const bucket = store.analytics[bucketKey(record.business_id)] || [];
  bucket.push(record);
  store.analytics[bucketKey(record.business_id)] = bucket;
  store.updatedAt = now;
  writeStore(store);
  return record;
}

export function listSocialAnalytics(businessId?: string): SocialAnalyticsEvent[] {
  const store = readStore();
  if (!businessId) {
    return Object.values(store.analytics).flat();
  }
  return store.analytics[bucketKey(businessId)] || [];
}
