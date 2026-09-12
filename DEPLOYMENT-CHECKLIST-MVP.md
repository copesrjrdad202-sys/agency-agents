# 🚀 DEPLOYMENT CHECKLIST — MVP TO PRODUCTION

**Target:** Launch by end of this week  
**Status:** Ready to execute  
**Goal:** Get first paying customers by end of month

---

## PHASE 1: TECHNICAL DEPLOYMENT (Days 1-2)

### 1. AWS Lambda Deployment
- [ ] Choose: AWS Lambda + API Gateway (or Google Cloud Run if preferred)
- [ ] Migrate from in-memory storage to DynamoDB (or PostgreSQL on RDS)
- [ ] Update environment variables (move from `.env` to AWS Secrets Manager)
- [ ] Test: Deploy all 9 microservices to Lambda
- [ ] Verify: Each service responds to health check endpoints
- [ ] Document: Production URLs for all services

**Time:** 4-6 hours  
**Owner:** You (use existing Stripe/Twilio connectors)  
**Validation:** Test end-to-end with real API (incoming call → booking → invoice)

---

### 2. Stripe Production Setup
- [ ] Switch Stripe API keys from test to live
- [ ] Verify webhook signatures for production events
- [ ] Test: Create invoice → send payment link → receive payment → mark paid
- [ ] Validate: Tax ledger updates when payment received
- [ ] Enable: Stripe Dashboard for monitoring

**Time:** 1-2 hours  
**Owner:** You  
**Test:** Create test invoice, send yourself payment link, complete payment

---

### 3. Twilio Production Setup
- [ ] Switch Twilio API keys from test to live
- [ ] Verify phone number is production-ready
- [ ] Test: Receive incoming call → AI answers → books appointment
- [ ] Validate: SMS confirmations send correctly
- [ ] Check: Call transcripts are logged

**Time:** 1-2 hours  
**Owner:** You  
**Test:** Call your business number, complete booking, verify calendar update

---

### 4. Security & Compliance (Quick Version)
- [ ] HTTPS enabled on all endpoints ✓
- [ ] Secrets NOT in code (move to AWS Secrets Manager) ✓
- [ ] API keys rotated before go-live ✓
- [ ] CORS configured (allow landing page domain) ✓
- [ ] Rate limiting enabled (prevent abuse) ✓
- [ ] Request logging in place (audit trail) ✓

**Time:** 1 hour  
**Owner:** You  
**Validation:** Scan with SSL Labs (https://www.ssllabs.com/), check logs

---

### 5. Monitoring & Alerts
- [ ] CloudWatch alerts set up (Lambda errors, timeouts, invocations)
- [ ] Stripe webhook monitoring (payment success, failed)
- [ ] Twilio monitoring (call completion rate, errors)
- [ ] Daily metrics email (customers, MRR, invoices, payments)

**Time:** 1 hour  
**Owner:** You  
**Validation:** Test by triggering an error, confirm alert fires

---

## PHASE 2: SALES & MARKETING (Days 1-3)

### 6. Landing Page (Carrd or Simple HTML)
- [ ] Copy content from LANDING-PAGE-COPY.md
- [ ] Design considerations:
  - [ ] Hero headline: "AI Receptionist for Plumbers, HVAC, Electricians"
  - [ ] Subheadline: "$30K+ annual profit increase"
  - [ ] Problem section: Show the pain (missed calls = lost revenue)
  - [ ] Solution section: Show the alternative (AI answers everything)
  - [ ] Video embed: Point to YouTube video
  - [ ] ROI section: The money (break-even in 5 days)
  - [ ] Pricing: $500/month (complete suite) + $99/month starter options
  - [ ] CTA: "Start Free Trial" → email capture → send access link
  - [ ] Testimonial section (will add real ones after launch)
  - [ ] FAQ section (use SALES-DECK.md)
- [ ] Domain: Buy simple domain (example.com or company-name.com)
- [ ] SSL certificate: Auto-managed by hosting platform
- [ ] Email setup: Free tier (Mailchimp, Brevo) to send trial access links

**Time:** 2-4 hours  
**Owner:** You (use Carrd or Webflow for speed)  
**Validation:** Load on phone, desktop, tablet. Test: submit email, receive confirmation

---

### 7. Product Demo Video
- [ ] Option A: DIY recording (fastest, $0)
  - [ ] Record: Incoming call → AI answers → customer asks questions → books appointment
  - [ ] Screen capture: Calendar updates, invoice generated, payment received, P&L updates
  - [ ] Use VIDEO-SCRIPT.md as guide
  - [ ] Tools: OBS (free), ScreenFlow (Mac), or Camtasia (paid but easier)
  - [ ] Length: 3-5 minutes
  - [ ] Editing: Basic cuts + simple graphics
  - [ ] Upload: YouTube (unlisted or public)
  - [ ] Embed: On landing page

- [ ] Option B: Hire videographer ($300-500, 2-3 day turnaround)
  - [ ] Brief: Show product in action, emphasize AI + booking
  - [ ] Delivery: Edited 5-min video, YouTube link, embed-ready

**Time:** 1-2 hours (DIY) or 3-5 days (hire)  
**Owner:** You or freelancer  
**Validation:** Play on landing page, mobile-friendly, sound working

---

### 8. Cold Email Campaign Launch
- [ ] Pick email template: Use #1 ("Missed Calls") or #5 ("Case Study") from COLD-EMAIL-TEMPLATES.md
- [ ] Prospect list: Plumbers + HVAC + Electricians in your region
  - [ ] Tools: Apollo.io free tier, LinkedIn Sales Navigator, or manual research
  - [ ] Target: 50-100 prospects for first week
  - [ ] Info needed: Business name, owner name, email/LinkedIn
- [ ] Customize: Add prospect name, their town, their service type
- [ ] Send: Use free email tier or Apollo/SalesLoft
- [ ] Track: Opens, clicks, replies
- [ ] Plan follow-ups: Day 5, Day 10 (from COLD-EMAIL-TEMPLATES.md)

**Time:** 1-2 hours  
**Owner:** You  
**Validation:** First email sends, you receive test, open rate tracking works

---

## PHASE 3: READINESS (Day 3)

### 9. Onboarding Script (15 minutes)
Create a simple script for first customers (you'll guide them):

```
Step 1: "Let's connect Stripe so you can get paid. I'll send you a secure link."
Step 2: "Now let's add your services and pricing. How many services do you offer? What's your price range?"
Step 3: "Set your hours: when do you work? What's your time zone?"
Step 4: "Let's test it. I'll send a test call to your number in 1 minute. You'll hear the AI greet you."
Step 5: "Answer the test call, say you need a plumbing appointment. The AI will book it."
Step 6: "You'll see the booking in your calendar. Check that it's right."
Step 7: "Done. You're live. The AI will answer real calls from now on."
Step 8: "Questions? I'm here to help. Email me anytime."
```

**Time:** 30 minutes  
**Owner:** You  
**Why:** Removes friction, ensures customers get set up correctly

- [ ] Mirror the script in [CUSTOMER-ONBOARDING-FLOW.md](./CUSTOMER-ONBOARDING-FLOW.md)

---

### 10. Demo Call Preparation
- [ ] Print SALES-DECK.md (14 slides)
- [ ] Prepare SALES-DECK.md digital version (Google Slides or PDF)
- [ ] Have VIDEO-SCRIPT.md visible (show demo on screen)
- [ ] Prepare ROI calculator (from LANDING-PAGE-COPY.md)
- [ ] Write down objection responses (from LAUNCH-ROADMAP-EXECUTE-NOW.md)
- [ ] Calendar: 30-min slots for demo calls
- [ ] Zoom link: Prepare for screen sharing

**Time:** 30 minutes  
**Owner:** You  
**Why:** When someone replies to cold email, you respond within 1 hour with demo link

### 10b. Legal Launch Pack
- [ ] Route the legal pass through the listed legal reviewer first
- [ ] Review [TERMS-OF-SERVICE.md](./TERMS-OF-SERVICE.md)
- [ ] Review [PRIVACY-POLICY.md](./PRIVACY-POLICY.md)
- [ ] Review [DATA-PROCESSING-ADDENDUM.md](./DATA-PROCESSING-ADDENDUM.md)
- [ ] Complete [LEGAL-LAUNCH-CHECKLIST.md](./LEGAL-LAUNCH-CHECKLIST.md)
- [ ] Get counsel sign-off before public launch

---

## PHASE 4: VALIDATION (Day 4)

### 11. End-to-End Test (Production)
- [ ] Test 1: Incoming call
  - [ ] Someone calls your Twilio number
  - [ ] AI answers, greets caller, asks how to help
  - [ ] Caller says "I need to book an appointment"
  - [ ] AI asks: name, service, preferred time
  - [ ] AI checks availability, offers time slots
  - [ ] Caller books appointment
  - [ ] Calendar updates (check Google Calendar)
  - [ ] ✓ Success: Booking appears in real calendar

- [ ] Test 2: Invoice creation
  - [ ] Manually trigger invoice generation
  - [ ] Verify: Invoice has service details, price, tax, total
  - [ ] Verify: Payment link is correct (Stripe)
  - [ ] ✓ Success: Invoice sends to customer

- [ ] Test 3: Payment processing
  - [ ] Create payment link from test invoice
  - [ ] Pay with test card (4242 4242 4242 4242)
  - [ ] Verify: Payment appears in Stripe Dashboard
  - [ ] Verify: Invoice marked "Paid" in system
  - [ ] Verify: Tax ledger updated with amount
  - [ ] ✓ Success: Full flow works

**Time:** 1-2 hours  
**Owner:** You  
**Validation:** All 3 tests pass, logs show no errors

---

### 12. Metrics Dashboard Setup
Create a simple Google Sheet to track daily:

| Date | Emails Sent | Opens | Replies | Demos Booked | Customers | MRR |
|------|---|---|---|---|---|---|
| Jan 9 | 50 | 12 | 2 | 0 | 0 | $0 |
| Jan 10 | 60 | 18 | 3 | 1 | 0 | $0 |
| Jan 11 | 70 | 22 | 4 | 1 | 1 | $500 |

**Why:** Track progress daily, adjust strategy weekly

**Time:** 30 minutes  
**Owner:** You

---

## PHASE 5: GO-LIVE (Day 5)

### 13. Launch Sequence (in order)
1. **Morning:** Final systems check (all services up, no errors in logs)
2. **10 AM:** Send first 50 cold emails
3. **Monitor:** Watch for replies, engagement, errors
4. **Afternoon:** If email replies → respond with video + demo link
5. **Evening:** Send email to your warm network (friends, colleagues)
6. **Next morning:** Send follow-up #1 to non-responders (day 5 from COLD-EMAIL-TEMPLATES.md)

**Time:** 2 hours active (then monitoring)  
**Owner:** You  
**Target:** First demo booked by Day 6

---

### 14. First Demo Call (When It Comes)
- [ ] Respond to email within 1 hour
- [ ] Send: Video link + "Here's our 5-min demo. Schedule demo call here: [Calendly link]"
- [ ] On demo call:
  - [ ] Ask: "What's your biggest frustration with incoming calls?"
  - [ ] Listen for: Missed calls, manual booking, time waste
  - [ ] Show: VIDEO-SCRIPT.md walkthrough (share screen)
  - [ ] Show: SALES-DECK.md slides (Slide 6 = ROI close)
  - [ ] Ask: "If this saved you 5 hours/week, would it be worth $500/month?"
  - [ ] Close: "Let's get you a 30-day free trial. You'll see the results yourself."
- [ ] Send: Trial access link + onboarding calendar

**Time:** 30 minutes  
**Owner:** You  
**Close Rate Target:** 30-50% of demos convert to trials → 50-70% of trials convert to paying

---

## WEEK 1 TARGETS

| Metric | Target | Status |
|--------|--------|--------|
| Deployment complete | Day 2 | ☐ |
| Landing page live | Day 2 | ☐ |
| Video uploaded | Day 2 | ☐ |
| First 50 emails sent | Day 2 | ☐ |
| Emails opened | 15-20 (30%) | ☐ |
| Replies received | 2-3 (3-5%) | ☐ |
| Demos booked | 1-2 | ☐ |
| Trial signups | 1-2 | ☐ |
| Paying customers | 0-1 (if trials convert) | ☐ |

---

## IF SOMETHING BREAKS

### Common Issues & Fixes

**Landing page not loading:**
- Check domain DNS (should point to hosting platform)
- Check HTTPS certificate (auto-renewed if < 30 days)
- Clear browser cache (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows)

**Emails marked as spam:**
- Add your domain SPF/DKIM records (hosting platform guides)
- Use warm sending tool (Apollo.io, Brevo) not SMTP directly
- Start with 50 emails, monitor spam folder, increase volume slowly

**Calls not being received:**
- Check Twilio phone number is active (Dashboard > Phone Numbers > Manage)
- Check webhook URL is production (not localhost)
- Test: Call the number from another phone, check logs

**Stripe payment fails:**
- Verify webhook endpoint in Stripe Dashboard
- Check API key is production (not test)
- Look at webhook delivery log (Stripe Dashboard > Webhooks)

**Calendar not updating:**
- Verify Google Calendar API is enabled
- Check OAuth token is still valid (may need re-auth)
- Test: Create appointment via API, check calendar 1 minute later

---

## SUCCESS METRICS (First 30 Days)

**Minimum viable launch:**
- ✓ System running 24/7 with < 5% downtime
- ✓ 10+ paying customers
- ✓ $5,000 MRR
- ✓ 100+ cold emails sent
- ✓ 3-5 demo calls booked
- ✓ 1-2 customer testimonials/case studies

**Great launch:**
- ✓ System running with 99%+ uptime
- ✓ 20+ paying customers
- ✓ $10,000 MRR
- ✓ 200+ cold emails sent
- ✓ 6-10 demo calls booked
- ✓ 3-5 customer testimonials
- ✓ Second vertical (electricians) in early talks

---

## ROLLBACK PLAN

If something catastrophically breaks:
1. Take Lambda function offline (toggle "Throttle" in AWS Console)
2. Display error page: "We're experiencing issues. Calls will be routed to your phone."
3. Update Twilio to forward calls to your personal number
4. Investigate: Check CloudWatch logs, Stripe webhook logs, Twilio logs
5. Fix: Redeploy updated code
6. Notify customers: "We experienced X, we fixed it, you're all set"

**Time to rollback:** < 10 minutes  
**Customer impact:** Calls still go through (to your phone), minimal downtime

---

## DO NOT DO THIS

- ❌ Don't deploy on Friday (no support if it breaks over weekend)
- ❌ Don't give customers real API keys (use JWT or temporary tokens)
- ❌ Don't use test Stripe/Twilio keys in production (security + billing nightmare)
- ❌ Don't deploy without testing end-to-end first
- ❌ Don't send 1000 cold emails day 1 (spam filter will blacklist you)
- ❌ Don't promise features you don't have yet
- ❌ Don't go silent after demo (follow up within 24 hours)

---

## YOUR CHECKLIST (COPY TO NOTES APP)

```
DEPLOYMENT CHECKLIST
====================

Day 1-2:
☐ Deploy to AWS Lambda
☐ Switch Stripe to production
☐ Switch Twilio to production
☐ Run end-to-end test (call → booking → invoice → payment → tax)
☐ Set up monitoring + alerts

Day 2-3:
☐ Build landing page (Carrd)
☐ Record or upload demo video (YouTube)
☐ Create cold email list (50 prospects)
☐ Prepare SALES-DECK.md and demo script
☐ Build onboarding script (15 min)

Day 4:
☐ Production validation test (all 3 flows)
☐ Set up metrics tracking (Google Sheet)
☐ Email list review (check formatting, add personal notes)

Day 5 (GO-LIVE):
☐ Final systems check (no errors)
☐ Send first 50 cold emails
☐ Monitor replies + engagement
☐ First demo reply → respond within 1 hour
☐ Watch for first paying customer

Week 2-4:
☐ Send 100+ more emails
☐ Follow-up sequences (day 5, 10)
☐ First 5+ demo calls
☐ First 2-3 paying customers
☐ Record customer success stories
☐ Tweak email copy based on reply rates
☐ Increase email volume if reply rate > 3%
```

---

## FINAL WORD

You're ready. The software works. The market wants it. The messaging is proven.

**This is the easy part.** Just ship it.

- Deploy today
- Send emails tomorrow
- Book demos day 3
- Close customers by day 10

Everything else flows from shipping fast and getting real feedback.

Good luck. 🚀

---

**Questions:** Check LAUNCH-ROADMAP-EXECUTE-NOW.md for detailed answers.  
**Demo prep:** Review SALES-DECK.md slides 6-8 (close slides).  
**Email templates:** Use COLD-EMAIL-TEMPLATES.md #1 or #5.  
**Video script:** Record using VIDEO-SCRIPT.md.

Ship fast. Get paid.
