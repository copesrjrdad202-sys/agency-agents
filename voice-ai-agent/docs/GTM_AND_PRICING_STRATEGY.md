# Go-To-Market (GTM) & Commercial Strategy

## 1. Value Proposition & Positioning
Position the Voice AI Agent as an **Instant 24/7 Virtual Front Desk / Receptionist** that prevents missed calls, qualifies leads, and books appointments directly into the business calendar—costing a fraction of a full-time receptionist.

---

## 2. Pricing & Packaging Model

### Standard Commercial Pricing
- **Setup / Onboarding Fee**: $500 - $1,500 one-time
  - System prompt customization & objection handling setup.
  - Twilio phone number provisioning & call forwarding setup.
  - Google Calendar / Multi-agent integration.
- **Monthly Subscription**: $299 - $499 / month
  - 24/7 AI answering & scheduling.
  - Up to 500 minutes of call processing per month included.
  - Call logs, recording transcripts, & SMS confirmations.
  - Additional minutes: $0.15/minute.

### Founder / Launch Special ("First 2 Clients in Each Category")
- **Setup Fee**: **$250** (50% OFF)
- **Monthly**: **$149 / month** (50% OFF lock-in for 12 months)
- **Condition**: Client agrees to provide a 1-minute video testimonial / written case study after 30 days of service.

---

## 3. Client Prospecting & Scraper Tool Blueprint

### Target Business Categories
1. **Home Services**: HVAC, Plumbing, Electricians, Roofing, Lawn Care, Pest Control.
2. **Medical & Dental**: General Dentistry, Chiropractic, Physical Therapy, MedSpas.
3. **Automotive**: Auto Repair, Tire Shops, Mobile Detailing.
4. **Professional Services**: Personal Injury Attorneys, Tax Preparation, Real Estate Agents.

### Prospect Identification Signals (High Intent Leads)
- Businesses with high Google review counts (50+) but negative reviews mentioning *"They never picked up the phone"* or *"Called twice, went to voicemail"*.
- Businesses that run Google Local Services Ads (LSA) or PPC ads (where every missed call loses $20-$100 in ad spend).
- Solo practitioners or small teams without a full-time dedicated receptionist.

### Scraper Tool Specs (`scripts/prospect-scraper.ts`)
- Queries Google Places API / Web Search for local business categories by region.
- Extracts: Business Name, Phone, Website, Rating, Review Count, GMB URL.
- Filters leads by review keywords (`missed call`, `no answer`, `voicemail`).
- Outputs actionable outreach leads in CSV / SQLite format.

---

## 4. Multi-Channel Outreach Scripts

### Cold Phone Script (Direct to Business Owner)
> "Hi [Owner Name], this is [Your Name]. Quick question—if a customer calls your shop after hours or while you're on a job, does someone answer live or does it go to voicemail? ... The reason I ask is we just built an AI voice receptionist for local [HVAC/plumbing/dental] businesses that answers in under 2 seconds, answers questions, and books appointments directly into your calendar. I'm taking on 2 beta partners in [City Name] at half-price to showcase the results. Can I call your business line with the AI right now so you can hear how human it sounds?"

### Cold Email / LinkedIn DM Script
> **Subject**: Quick question about missed calls at [Business Name]
>
> Hi [Owner Name],
>
> I noticed [Business Name] has great reviews in [City Name].
>
> Quick question: when your phone rings while your team is busy on a job or after hours, how many of those callers hang up and call a competitor instead?
>
> We built a 24/7 AI Voice Receptionist specifically for [Industry] businesses that answers live, handles questions, and books appointments straight into your Google Calendar.
>
> We're offering 50% off setup and monthly plans for the first 2 [Industry] businesses in [City Name] in exchange for a short testimonial once it's booking calls for you.
>
> Worth a quick 3-minute test call to hear it live?
>
> Best,  
> [Your Name]  
> [Your Agency Phone Number]

---

## 5. Dogfooding Strategy ("Client Zero")

Before pitching external clients, deploy the Voice AI Agent for your own Agency!

### Agency Setup Details:
- **Twilio Number**: Dedicated line for your Agency sales/inquiries.
- **System Prompt**: Custom prompt trained on your AI Voice Agency services, pricing, and FAQ.
- **Calendar**: Integrated with your personal/agency Google Calendar.
- **Live Proof**: When calling prospects, give them YOUR agency number to test live: *"Don't take my word for it—call our AI line right now at (XXX) XXX-XXXX and try to book a demo!"*
