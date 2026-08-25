import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import { getBusiness, listInvoices, listPayments, loadTaxSheet } from './persistentDb';

dotenv.config();

const PORT = Number(process.env.PNL_AGENT_PORT || 3950);

type PeriodKey = 'today' | 'month' | 'ytd' | 'all';

type MetricWindow = {
  label: string;
  start: Date;
  end: Date;
};

type MoneySummary = {
  gross_revenue_cents: number;
  tax_recorded_cents: number;
  profit_proxy_cents: number;
  margin_percent: number;
};

type PnlSnapshot = {
  business_id: string;
  business_name: string;
  period: PeriodKey;
  window: { start: string; end: string };
  revenue: MoneySummary;
  collections: {
    payments_count: number;
    invoices_paid_count: number;
    invoices_open_count: number;
    accounts_receivable_cents: number;
    overdue_cents: number;
  };
  tax: {
    entries_count: number;
    recorded_income_cents: number;
  };
  yoy: {
    revenue_growth_percent: number | null;
    profit_growth_percent: number | null;
    current_period_revenue_cents: number;
    prior_period_revenue_cents: number;
  };
  assumptions: string[];
  ts: string;
};

const app = express();
app.use(bodyParser.json());

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));
}

function startOfUtcYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
}

function shiftYears(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
}

function resolveWindow(period: PeriodKey, now = new Date()): MetricWindow {
  if (period === 'today') {
    return { label: 'today', start: startOfUtcDay(now), end: now };
  }
  if (period === 'month') {
    return { label: 'month', start: startOfUtcMonth(now), end: now };
  }
  if (period === 'ytd') {
    return { label: 'ytd', start: startOfUtcYear(now), end: now };
  }
  return { label: 'all', start: new Date('1970-01-01T00:00:00.000Z'), end: now };
}

function resolveComparableWindow(window: MetricWindow): MetricWindow {
  if (window.label === 'all') {
    return { label: 'all', start: new Date('1970-01-01T00:00:00.000Z'), end: window.end };
  }
  const spanMs = window.end.getTime() - window.start.getTime();
  const priorEnd = shiftYears(window.end, -1);
  const priorStart = new Date(priorEnd.getTime() - spanMs);
  return { label: `${window.label}-prior`, start: priorStart, end: priorEnd };
}

function centsSum(records: Array<{ amount_cents?: number; amount_due?: number }>): number {
  return records.reduce((total, item) => total + Number(item.amount_cents || item.amount_due || 0), 0);
}

function inWindow(timestamp: string | undefined, window: MetricWindow): boolean {
  if (!timestamp) return window.label === 'all';
  const time = new Date(timestamp).getTime();
  return time >= window.start.getTime() && time <= window.end.getTime();
}

function safePercent(current: number, base: number): number | null {
  if (base === 0) return null;
  return Number((((current - base) / base) * 100).toFixed(2));
}

function buildSnapshot(businessId: string, period: PeriodKey): PnlSnapshot {
  const business = getBusiness(businessId);
  if (!business) {
    throw new Error(`Business not found: ${businessId}`);
  }

  const now = new Date();
  const window = resolveWindow(period, now);
  const comparableWindow = resolveComparableWindow(window);

  const invoices = listInvoices(businessId);
  const payments = listPayments(businessId);
  const taxSheet = loadTaxSheet(businessId);

  const revenuePayments = payments.filter((payment) => payment.status === 'completed' && inWindow(payment.recorded_at, window));
  const priorRevenuePayments = payments.filter((payment) => payment.status === 'completed' && inWindow(payment.recorded_at, comparableWindow));

  const filteredInvoices = invoices.filter((invoice) => inWindow(invoice.created_at, window));
  const filteredTaxEntries = taxSheet.entries.filter((entry) => inWindow(entry.recorded_at, window));
  const priorTaxEntries = taxSheet.entries.filter((entry) => inWindow(entry.recorded_at, comparableWindow));

  const grossRevenueCents = centsSum(revenuePayments);
  const priorRevenueCents = centsSum(priorRevenuePayments);
  const taxRecordedCents = filteredTaxEntries.reduce((total, entry) => total + Number(entry.amount_cents || 0), 0);
  const priorTaxRecordedCents = priorTaxEntries.reduce((total, entry) => total + Number(entry.amount_cents || 0), 0);

  const openInvoices = filteredInvoices.filter((invoice) => invoice.status === 'open' || invoice.status === 'draft');
  const paidInvoices = filteredInvoices.filter((invoice) => invoice.status === 'paid');
  const overdue = filteredInvoices.filter((invoice) => {
    if (!invoice.due_date) return false;
    return new Date(invoice.due_date).getTime() < now.getTime() && invoice.status !== 'paid';
  });

  const accountsReceivable = centsSum(openInvoices);
  const profitProxy = grossRevenueCents - taxRecordedCents;

  return {
    business_id: businessId,
    business_name: business.branding?.displayName || business.name,
    period,
    window: {
      start: window.start.toISOString(),
      end: window.end.toISOString(),
    },
    revenue: {
      gross_revenue_cents: grossRevenueCents,
      tax_recorded_cents: taxRecordedCents,
      profit_proxy_cents: profitProxy,
      margin_percent: grossRevenueCents > 0 ? Number(((profitProxy / grossRevenueCents) * 100).toFixed(2)) : 0,
    },
    collections: {
      payments_count: revenuePayments.length,
      invoices_paid_count: paidInvoices.length,
      invoices_open_count: openInvoices.length,
      accounts_receivable_cents: accountsReceivable,
      overdue_cents: centsSum(overdue),
    },
    tax: {
      entries_count: filteredTaxEntries.length,
      recorded_income_cents: taxRecordedCents,
    },
    yoy: {
      revenue_growth_percent: safePercent(grossRevenueCents, priorRevenueCents),
      profit_growth_percent: safePercent(profitProxy, priorRevenueCents - priorTaxRecordedCents),
      current_period_revenue_cents: grossRevenueCents,
      prior_period_revenue_cents: priorRevenueCents,
    },
    assumptions: [
      'Profit is a proxy: revenue minus recorded tax entries because expense/COGS data is not yet connected.',
      'All reporting uses persistent local storage, not in-memory process state.',
      'Time windows are computed in UTC for deterministic behavior.',
    ],
    ts: now.toISOString(),
  };
}

function renderDashboard(snapshot: PnlSnapshot): string {
  const currency = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  return `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${snapshot.business_name} P&L</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; color: #111827; background: #f9fafb; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
        h1, h2 { margin: 0 0 12px; }
        .muted { color: #6b7280; }
        .value { font-size: 28px; font-weight: 700; margin-top: 8px; }
        ul { margin: 8px 0 0 18px; }
      </style>
    </head>
    <body>
      <h1>${snapshot.business_name} P&L</h1>
      <p class="muted">Business ID: ${snapshot.business_id} | Period: ${snapshot.period} | Generated: ${snapshot.ts}</p>
      <div class="grid">
        <div class="card"><div class="muted">Revenue</div><div class="value">${currency(snapshot.revenue.gross_revenue_cents)}</div></div>
        <div class="card"><div class="muted">Tax Recorded</div><div class="value">${currency(snapshot.revenue.tax_recorded_cents)}</div></div>
        <div class="card"><div class="muted">Profit Proxy</div><div class="value">${currency(snapshot.revenue.profit_proxy_cents)}</div></div>
        <div class="card"><div class="muted">Margin</div><div class="value">${snapshot.revenue.margin_percent.toFixed(2)}%</div></div>
        <div class="card"><div class="muted">A/R</div><div class="value">${currency(snapshot.collections.accounts_receivable_cents)}</div></div>
        <div class="card"><div class="muted">Overdue</div><div class="value">${currency(snapshot.collections.overdue_cents)}</div></div>
      </div>
      <h2 style="margin-top:20px;">Assumptions</h2>
      <ul>${snapshot.assumptions.map((item) => `<li>${item}</li>`).join('')}</ul>
      <h2 style="margin-top:20px;">YoY</h2>
      <p>Revenue growth: ${snapshot.yoy.revenue_growth_percent === null ? 'N/A' : `${snapshot.yoy.revenue_growth_percent.toFixed(2)}%`}</p>
      <p>Profit growth: ${snapshot.yoy.profit_growth_percent === null ? 'N/A' : `${snapshot.yoy.profit_growth_percent.toFixed(2)}%`}</p>
    </body>
  </html>`;
}

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', provider: 'pnl-agent', ts: new Date().toISOString() });
});

app.get('/businesses/:businessId/pnl', (req, res) => {
  try {
    const period = (String(req.query.period || 'ytd') as PeriodKey);
    const snapshot = buildSnapshot(req.params.businessId, period);
    res.json({ snapshot, ts: new Date().toISOString() });
  } catch (error: any) {
    res.status(404).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.get('/businesses/:businessId/dashboard', (req, res) => {
  try {
    const period = (String(req.query.period || 'ytd') as PeriodKey);
    const snapshot = buildSnapshot(req.params.businessId, period);
    res.type('html').send(renderDashboard(snapshot));
  } catch (error: any) {
    res.status(404).type('text').send(error.message);
  }
});

app.get('/businesses/:businessId/pnl/summary', (req, res) => {
  try {
    const snapshot = buildSnapshot(req.params.businessId, 'ytd');
    res.json({
      business_id: snapshot.business_id,
      business_name: snapshot.business_name,
      revenue_cents: snapshot.revenue.gross_revenue_cents,
      profit_proxy_cents: snapshot.revenue.profit_proxy_cents,
      margin_percent: snapshot.revenue.margin_percent,
      accounts_receivable_cents: snapshot.collections.accounts_receivable_cents,
      ts: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(404).json({ error: error.message, ts: new Date().toISOString() });
  }
});

app.listen(PORT, () => {
  console.log(`P&L Agent listening on http://localhost:${PORT}`);
});
