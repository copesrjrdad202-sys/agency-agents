import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import {
  listBusinesses,
  getBusiness,
  listInvoices,
  listPayments,
  loadTaxSheet,
  listCalendarEvents,
} from './persistentDb';

dotenv.config();

const PORT = Number(process.env.DASHBOARD_AGENT_PORT || 3970);
const PNL_AGENT_URL = process.env.PNL_AGENT_URL || 'http://127.0.0.1:3950';
const REMINDER_AGENT_URL = process.env.REMINDER_AGENT_URL || 'http://127.0.0.1:3900';
const SOCIAL_AUTOMATION_URL = process.env.SOCIAL_AUTOMATION_URL || 'http://127.0.0.1:3961';

// Basic auth credentials. Set DASHBOARD_USER / DASHBOARD_PASSWORD in the environment.
// If unset, the dashboard falls back to a clearly-labeled default that only makes
// sense for local testing, and prints a warning so it is never silently exposed.
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || '';

if (!process.env.DASHBOARD_PASSWORD) {
  console.warn('Warning: DASHBOARD_PASSWORD not set. The dashboard is running with authentication DISABLED.');
  console.warn('Set DASHBOARD_USER and DASHBOARD_PASSWORD in the environment before exposing this publicly.');
}

const app = express();
app.use(bodyParser.json());

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!DASHBOARD_PASSWORD) {
    // No password configured: allow access but this should only happen in local/dev use.
    return next();
  }
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    res.set('WWW-Authenticate', 'Basic realm="Front Desk Dashboard"');
    return res.status(401).send('Authentication required');
  }
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);
  if (user === DASHBOARD_USER && pass === DASHBOARD_PASSWORD) {
    return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Front Desk Dashboard"');
  return res.status(401).send('Invalid credentials');
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: 'dashboard-agent', auth_enabled: Boolean(DASHBOARD_PASSWORD), ts: new Date().toISOString() });
});

async function fetchJsonSafe(url: string): Promise<{ ok: boolean; body: any }> {
  try {
    const response = await fetch(url);
    const body = await response.json().catch(() => null);
    return { ok: response.ok, body };
  } catch (error: any) {
    return { ok: false, body: { error: error.message } };
  }
}

function currency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

app.get('/', requireAuth, (_req, res) => {
  const businesses = listBusinesses();
  const rows = businesses
    .map((b) => `<li><a href="/dashboard/${encodeURIComponent(b.id)}">${escapeHtml(b.name)}</a> <span class="muted">(${escapeHtml(b.id)})</span></li>`)
    .join('');
  res.type('html').send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>Front Desk Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; color: #111827; background: #f9fafb; }
        .muted { color: #6b7280; }
        ul { list-style: none; padding: 0; }
        li { padding: 10px 0; border-bottom: 1px solid #e5e7eb; }
        a { color: #2563eb; text-decoration: none; font-weight: 600; }
      </style>
    </head>
    <body>
      <h1>Front Desk Dashboard</h1>
      <p class="muted">Select a business to view its full operations dashboard.</p>
      <ul>${rows || '<li class="muted">No businesses configured yet.</li>'}</ul>
    </body>
  </html>`);
});

app.get('/dashboard/:businessId', requireAuth, async (req, res) => {
  const businessId = req.params.businessId;
  const business = getBusiness(businessId);
  if (!business) {
    return res.status(404).type('text').send(`Business not found: ${businessId}`);
  }

  const [pnl, reminders, socialQueue] = await Promise.all([
    fetchJsonSafe(`${PNL_AGENT_URL}/businesses/${encodeURIComponent(businessId)}/pnl?period=month`),
    fetchJsonSafe(`${REMINDER_AGENT_URL}/reminders`),
    fetchJsonSafe(`${SOCIAL_AUTOMATION_URL}/businesses/${encodeURIComponent(businessId)}/queue`),
  ]);

  const invoices = listInvoices(businessId);
  const payments = listPayments(businessId);
  const taxSheet = loadTaxSheet(businessId);
  const events = listCalendarEvents(businessId).filter((e) => e.status !== 'cancelled');
  const upcoming = events
    .filter((e) => new Date(e.start.dateTime).getTime() >= Date.now())
    .sort((a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime())
    .slice(0, 10);

  const openInvoices = invoices.filter((i) => i.status === 'open' || i.status === 'draft');
  const paidInvoices = invoices.filter((i) => i.status === 'paid');

  const snapshot = pnl.ok ? pnl.body.snapshot : null;
  const businessReminders = (reminders.ok ? reminders.body.reminders || [] : []).filter(
    (r: any) => r.business_id === businessId
  );
  const socialTotals = socialQueue.ok ? socialQueue.body.totals : null;

  const upcomingRows = upcoming
    .map(
      (e) =>
        `<tr><td>${escapeHtml(e.summary || '')}</td><td>${new Date(e.start.dateTime).toLocaleString()}</td><td>${escapeHtml(e.status)}</td></tr>`
    )
    .join('');

  const invoiceRows = invoices
    .slice(0, 15)
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.id)}</td><td>${currency(i.amount_due)}</td><td>${escapeHtml(i.status)}</td><td>${escapeHtml(i.customer_email)}</td></tr>`
    )
    .join('');

  const reminderRows = businessReminders
    .slice(0, 10)
    .map(
      (r: any) =>
        `<tr><td>${escapeHtml(r.customer_name || '')}</td><td>${escapeHtml(r.reminder_type || '')}</td><td>${escapeHtml(r.status || '')}</td><td>${r.send_at ? new Date(r.send_at).toLocaleString() : ''}</td></tr>`
    )
    .join('');

  res.type('html').send(`<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(business.name)} — Dashboard</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; color: #111827; background: #f9fafb; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
        h1, h2 { margin: 0 0 12px; }
        .muted { color: #6b7280; }
        .value { font-size: 26px; font-weight: 700; margin-top: 8px; }
        table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
        th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        th { background: #f3f4f6; }
        a.back { color: #2563eb; text-decoration: none; font-size: 14px; }
      </style>
    </head>
    <body>
      <a class="back" href="/">&larr; All businesses</a>
      <h1>${escapeHtml(business.name)}</h1>
      <p class="muted">Business ID: ${escapeHtml(businessId)} | Generated: ${new Date().toISOString()}</p>

      <h2>This Month</h2>
      <div class="grid">
        <div class="card"><div class="muted">Revenue</div><div class="value">${snapshot ? currency(snapshot.revenue.gross_revenue_cents) : 'N/A'}</div></div>
        <div class="card"><div class="muted">Tax Recorded</div><div class="value">${snapshot ? currency(snapshot.revenue.tax_recorded_cents) : currency(taxSheet.total_income_cents || 0)}</div></div>
        <div class="card"><div class="muted">Accounts Receivable</div><div class="value">${snapshot ? currency(snapshot.collections.accounts_receivable_cents) : 'N/A'}</div></div>
        <div class="card"><div class="muted">Overdue</div><div class="value">${snapshot ? currency(snapshot.collections.overdue_cents) : 'N/A'}</div></div>
        <div class="card"><div class="muted">Open Invoices</div><div class="value">${openInvoices.length}</div></div>
        <div class="card"><div class="muted">Paid Invoices</div><div class="value">${paidInvoices.length}</div></div>
        <div class="card"><div class="muted">Payments Recorded</div><div class="value">${payments.length}</div></div>
        <div class="card"><div class="muted">Social Posts Queued</div><div class="value">${socialTotals ? Object.values(socialTotals).reduce((a: any, b: any) => a + b, 0) : 'N/A'}</div></div>
      </div>

      <h2>Upcoming Appointments</h2>
      <table>
        <thead><tr><th>Service</th><th>Time</th><th>Status</th></tr></thead>
        <tbody>${upcomingRows || '<tr><td colspan="3" class="muted">No upcoming appointments.</td></tr>'}</tbody>
      </table>

      <h2>Recent Invoices</h2>
      <table>
        <thead><tr><th>Invoice ID</th><th>Amount</th><th>Status</th><th>Customer</th></tr></thead>
        <tbody>${invoiceRows || '<tr><td colspan="4" class="muted">No invoices yet.</td></tr>'}</tbody>
      </table>

      <h2>Reminders</h2>
      <table>
        <thead><tr><th>Customer</th><th>Type</th><th>Status</th><th>Send At</th></tr></thead>
        <tbody>${reminderRows || '<tr><td colspan="4" class="muted">No reminders scheduled.</td></tr>'}</tbody>
      </table>

      <p class="muted">Full P&amp;L: <a href="${PNL_AGENT_URL}/businesses/${encodeURIComponent(businessId)}/dashboard">${PNL_AGENT_URL}/businesses/${encodeURIComponent(businessId)}/dashboard</a></p>
    </body>
  </html>`);
});

app.listen(PORT, () => {
  console.log(`Dashboard Agent listening on http://localhost:${PORT}`);
});
