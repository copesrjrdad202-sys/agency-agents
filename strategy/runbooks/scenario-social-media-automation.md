# 🔐 Runbook: Social Media Automation Access Control

> **Mode**: NEXUS-Micro to NEXUS-Sprint | **Purpose**: Safe write access for social automation

---

## Goal

Give each social agent only the access it needs, with separate keys per platform and per job.

## Non-Negotiable Rules

- No shared master social key
- Separate credentials per platform
- Separate credentials per function: read, draft, publish, ads, engagement
- Brand Guardian approves public-facing content before publish
- Legal Compliance Checker approves regulated claims and promotional copy
- Analytics stays read-only
- Revocation must be possible per key, without breaking the rest of the stack

## Agent Roles and Permissions

| Agent | Read | Draft | Publish | Reply/DM | Ads | Notes |
|---|---|---|---|---|---|---|
| Social Media Strategist | Yes | Yes | No | No | No | Planning only |
| Content Creator | Yes | Yes | No | No | No | Drafts only |
| Brand Guardian | Yes | Review only | No | No | No | Approval gate |
| Legal Compliance Checker | Yes | Review only | No | No | No | Approval gate for claims |
| Analytics Reporter | Yes | No | No | No | No | Read-only metrics |
| Twitter Engager | Yes | No | Yes | Yes | No | X only |
| LinkedIn Content Creator | Yes | No | Yes | No | No | LinkedIn only |
| Instagram Curator | Yes | No | Yes | No | No | Instagram only |
| TikTok Strategist | Yes | No | Yes | No | No | TikTok only |
| Reddit Community Builder | Yes | No | Yes | Yes | No | Reddit only |
| Paid Social Strategist | Yes | No | No | No | Yes | Ad accounts only |

## Separate Key Layout

Use one secret per platform per environment.

### Suggested secret names

- `SOCIAL_X_READ_TOKEN`
- `SOCIAL_X_WRITE_TOKEN`
- `SOCIAL_LINKEDIN_WRITE_TOKEN`
- `SOCIAL_INSTAGRAM_WRITE_TOKEN`
- `SOCIAL_TIKTOK_WRITE_TOKEN`
- `SOCIAL_REDDIT_WRITE_TOKEN`
- `SOCIAL_META_ADS_TOKEN`
- `SOCIAL_ANALYTICS_READ_TOKEN`

### Environment separation

- `DEV_*`
- `STAGING_*`
- `PROD_*`

Never reuse production keys in dev or staging.

## Approval Flow

1. Content Creator drafts
2. Social Media Strategist schedules
3. Brand Guardian reviews
4. Legal Compliance Checker reviews if needed
5. Platform-specific writer publishes
6. Analytics Reporter monitors performance

## Operational Safeguards

- Audit every publish, reply, delete, and ad spend action
- Fail closed on unknown scopes
- Rotate keys on hire, role change, or offboarding
- Store secrets in the vault only
- No credentials in source control
- Use short-lived tokens where the platform supports them

## Recommended Platform Setup

### X / Twitter
- Read analytics
- Write replies and scheduled posts only
- Separate engagement token from publish token

### LinkedIn
- Use a dedicated app for page publishing
- No personal account credentials in automation

### Instagram / Meta
- Separate publish token and ads token
- Organic publishing isolated from ad operations

### TikTok
- Dedicated publish token only
- No cross-platform reuse

### Reddit
- Separate posting and moderation scope
- Avoid any automated mass posting behavior

## Done Criteria

- Each platform has its own key set
- Each agent has a clearly bounded scope
- Approval gates are documented
- Revocation path exists for every credential
- Analytics remains read-only

