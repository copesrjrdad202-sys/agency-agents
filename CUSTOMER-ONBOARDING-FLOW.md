# Customer Onboarding Flow

Effective date: 2026-08-21

## Goal
Get a new business live in under 15 minutes.

## Owners
- Customer Success Manager: overall experience
- Support Responder: live help
- Legal Compliance Checker: legal acceptance gate
- Business Context Agent: profile storage
- Calendar Agent: scheduling setup
- Invoice Agent: billing setup
- Payment Agent: payment verification
- Tax Agent: ledger setup
- Social Media Automation Agent: optional promo setup

## Flow

### 1. Invite
Send the business a secure onboarding link.

### 2. Verify business identity
Collect:
- business name
- contact name
- email
- phone
- time zone
- service list
- pricing

### 3. Legal acceptance
Customer accepts:
- Terms of Service
- Privacy Policy
- DPA if applicable

### 4. Connect billing
- connect Stripe
- confirm payment method
- run a $1 test payment if needed

### 5. Connect calendar
- start Google OAuth
- save business-owned tokens
- choose primary calendar

Prototype helper:
`node examples/onboardGoogleClient.ts <businessId> <GOOGLE_CLIENT_ID> <GOOGLE_CLIENT_SECRET>`

### 6. Connect phone
- assign Twilio number
- confirm caller ID and forwarding fallback

### 7. Configure business profile
Save:
- greeting tone
- hours
- services
- pricing
- escalation rules
- holiday schedule

### 8. Run test call
Test:
- greeting
- question answering
- booking
- invoice creation
- payment link
- dashboard update

### 9. Go live
Once all checks pass, flip the business to active.

## Success Criteria
- customer signed legal docs
- calendar connected
- phone connected
- billing verified
- test call passed
- support contact confirmed

## Fallbacks
- If calendar fails: route to manual booking
- If billing fails: disable paid actions, keep Q&A live
- If phone fails: forward to human fallback number

## Time Targets
- Self-serve setup: 10-15 minutes
- Assisted setup: 15-30 minutes
