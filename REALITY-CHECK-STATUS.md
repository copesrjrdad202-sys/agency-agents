# Reality Check Status

This is the no-fluff version: what is actually built, what is usable, and what is still not production-go-live.

## Verified and usable now

- [examples/businessContextAgent.ts](./examples/businessContextAgent.ts) uses a shared persistent store for business profiles.
- [examples/stripeConnectorLive.ts](./examples/stripeConnectorLive.ts) creates and tracks local invoice records and uses real Stripe payment links.
- [examples/taxAgent.ts](./examples/taxAgent.ts) records tax income into the shared persistent store.
- [examples/onboardGoogleClient.ts](./examples/onboardGoogleClient.ts) is a real Google OAuth onboarding helper.
- [examples/persistentDb.ts](./examples/persistentDb.ts) is a durable shared JSON-backed store with atomic writes.
- [examples/package.json](./examples/package.json) has working `typecheck`, `build`, `validate:prod`, `package:prod`, and `deploy:prep` scripts.
- [.github/workflows/deploy-examples.yml](./.github/workflows/deploy-examples.yml) validates and packages the examples bundle in CI.
- [CUSTOMER-ONBOARDING-FLOW.md](./CUSTOMER-ONBOARDING-FLOW.md), [TERMS-OF-SERVICE.md](./TERMS-OF-SERVICE.md), [PRIVACY-POLICY.md](./PRIVACY-POLICY.md), and [DATA-PROCESSING-ADDENDUM.md](./DATA-PROCESSING-ADDENDUM.md) exist as launch documentation.
- [landing-page.html](./landing-page.html) is a usable static landing page scaffold.

## Verified by actual commands

- `npm run typecheck` passes in `examples/`
- `npm run build` passes in `examples/`
- `npm run validate:prod` passes with required secrets present
- `npm run package:prod` completes successfully

## Still not go-live

- AWS Lambda / API Gateway are scaffolded, not deployed.
- ElevenLabs is present as code, but not integrated into the runtime path yet.
- Calendar Agent orchestration is still in progress.
- Legal docs are drafts until counsel review/sign-off is done.
- The public sales metrics in copy are projections/marketing claims, not measured customer counts.

## What to trust

Trust:
- code that compiled
- scripts that executed successfully
- files that exist in the repo

Do not trust as fact:
- revenue/customer-count claims in sales copy
- "production-ready" language in marketing docs unless a check actually passed
- any capability not backed by an implementation file or a passing command

