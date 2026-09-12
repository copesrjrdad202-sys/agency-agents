import fs from 'fs';
import path from 'path';

export type Service = {
  id: string;
  name: string;
  description?: string;
  price_cents: number;
  duration_minutes?: number;
};

export type BusinessProfile = {
  id: string;
  name: string;
  businessType?: 'hvac' | 'plumbing' | 'general-service';
  branding?: {
    displayName?: string;
    greeting?: string;
    brandColor?: string;
  };
  services: Service[];
  calendar?: {
    provider: 'google' | 'mock';
    credentialsPath?: string;
    calendarId?: string;
  } | null;
  invoiceTemplate?: string;
  taxSheetPath?: string;
  contact?: {
    phone?: string;
    email?: string;
  };
  policies?: {
    emergencyResponse?: string;
    cancellation?: string;
    afterHours?: string;
  };
};

export type LocalInvoice = {
  id: string;
  business_id?: string;
  status: 'draft' | 'open' | 'paid' | 'void';
  amount_due: number;
  currency: string;
  customer_email: string;
  description: string;
  metadata: Record<string, string>;
  due_date?: string;
  created_at?: string;
  updated_at?: string;
  paid_at?: string;
};

export type PaymentRecord = {
  id: string;
  invoice_id: string;
  business_id: string;
  amount_cents: number;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  payment_method: string;
  recorded_at: string;
  reference?: string;
};

export type TaxEntry = {
  id: string;
  business_id: string;
  invoice_id: string;
  amount_cents: number;
  recorded_at: string;
};

export type TaxSheet = {
  business_id: string;
  entries: TaxEntry[];
  total_income_cents: number;
  last_updated: string;
};

export type CalendarEvent = {
  id: string;
  business_id: string;
  calendar_id: string;
  summary: string;
  description?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  status: 'confirmed' | 'cancelled';
  created_at: string;
  updated_at: string;
};

type AppDatabase = {
  businesses: Record<string, BusinessProfile>;
  invoices: Record<string, LocalInvoice>;
  payments: Record<string, PaymentRecord>;
  taxSheets: Record<string, TaxSheet>;
  calendarEvents: Record<string, CalendarEvent[]>;
  calendarTokens: Record<string, unknown>;
  updatedAt: string;
};

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app-db.json');
const LEGACY_BUSINESSES_PATH = path.join(DATA_DIR, 'businesses.json');

const defaultHvacPlumbingBusiness: BusinessProfile = {
  id: 'hvac-plumbing-pro',
  name: 'HVAC & Plumbing Pro',
  businessType: 'hvac',
  branding: {
    displayName: 'HVAC & Plumbing Pro',
    greeting: 'Thank you for calling HVAC & Plumbing Pro. How can we help today?',
    brandColor: '#0f766e',
  },
  services: [
    { id: 'emergency-service', name: 'Emergency Service Call', description: 'Priority visit for urgent heating or plumbing issues.', price_cents: 14900, duration_minutes: 60 },
    { id: 'ac-tuneup', name: 'AC Tune-Up', description: 'Seasonal HVAC performance inspection and cleaning.', price_cents: 8900, duration_minutes: 90 },
    { id: 'furnace-repair', name: 'Furnace Repair', description: 'Repair and diagnostics for heating systems.', price_cents: 18900, duration_minutes: 120 },
    { id: 'water-heater-install', name: 'Water Heater Installation', description: 'Tank or tankless water heater installation service.', price_cents: 39900, duration_minutes: 180 },
    { id: 'drain-cleaning', name: 'Drain Cleaning', description: 'Clearing clogs and slow drains in kitchen, bath, or main lines.', price_cents: 12900, duration_minutes: 75 },
    { id: 'diagnostic-visit', name: 'Diagnostic Visit', description: 'On-site visit to assess the issue and recommend next steps.', price_cents: 9900, duration_minutes: 60 },
  ],
  calendar: {
    provider: 'mock',
    calendarId: 'hvac-plumbing-pro',
  },
  invoiceTemplate: 'service-invoice-v1',
  taxSheetPath: 'data/tax/hvac-plumbing-pro-ledger.json',
  contact: {
    phone: '(555) 230-1044',
    email: 'office@hvacplumbingpro.example',
  },
  policies: {
    emergencyResponse: 'Same-day emergency appointments are prioritized when availability allows.',
    cancellation: 'Appointments canceled within 2 hours may incur a service call fee.',
    afterHours: 'After-hours calls are routed to the emergency queue and billed at emergency service rates.',
  },
};

function ensureDbFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_PATH)) {
    let legacyBusinesses: Record<string, BusinessProfile> = {};
    if (fs.existsSync(LEGACY_BUSINESSES_PATH)) {
      try {
        legacyBusinesses = JSON.parse(fs.readFileSync(LEGACY_BUSINESSES_PATH, 'utf8')) as Record<string, BusinessProfile>;
      } catch {
        legacyBusinesses = {};
      }
    }
    const initial: AppDatabase = {
      businesses: legacyBusinesses,
      invoices: {},
      payments: {},
      taxSheets: {},
      calendarEvents: {},
      calendarTokens: {},
      updatedAt: new Date().toISOString(),
    };
    if (Object.keys(initial.businesses).length === 0) {
      initial.businesses[defaultHvacPlumbingBusiness.id] = defaultHvacPlumbingBusiness;
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readDb(): AppDatabase {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw) as Partial<AppDatabase>;
  const businesses = parsed.businesses && Object.keys(parsed.businesses).length > 0 ? parsed.businesses : { [defaultHvacPlumbingBusiness.id]: defaultHvacPlumbingBusiness };
  const db = {
    businesses,
    invoices: parsed.invoices || {},
    payments: parsed.payments || {},
    taxSheets: parsed.taxSheets || {},
    calendarEvents: parsed.calendarEvents || {},
    calendarTokens: parsed.calendarTokens || {},
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  };
  if (!parsed.businesses || Object.keys(parsed.businesses).length === 0) {
    writeDb(db);
  }
  return db;
}

function writeDb(db: AppDatabase) {
  ensureDbFile();
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}

export function listBusinesses(): BusinessProfile[] {
  return Object.values(readDb().businesses);
}

export function getBusiness(id: string): BusinessProfile | null {
  const db = readDb();
  return db.businesses[id] || null;
}

export function upsertBusiness(profile: BusinessProfile): BusinessProfile {
  const db = readDb();
  db.businesses[profile.id] = profile;
  db.updatedAt = new Date().toISOString();
  writeDb(db);
  return profile;
}

export function deleteBusiness(id: string): boolean {
  const db = readDb();
  if (!db.businesses[id]) {
    return false;
  }
  delete db.businesses[id];
  db.updatedAt = new Date().toISOString();
  writeDb(db);
  return true;
}

export function upsertInvoice(invoice: LocalInvoice): LocalInvoice {
  const db = readDb();
  const now = new Date().toISOString();
  const next: LocalInvoice = {
    ...invoice,
    created_at: invoice.created_at || now,
    updated_at: now,
  };
  db.invoices[invoice.id] = next;
  db.updatedAt = now;
  writeDb(db);
  return next;
}

export function getInvoice(id: string): LocalInvoice | null {
  const db = readDb();
  return db.invoices[id] || null;
}

export function listInvoices(businessId?: string): LocalInvoice[] {
  const db = readDb();
  const invoices = Object.values(db.invoices);
  return businessId ? invoices.filter((invoice) => invoice.business_id === businessId) : invoices;
}

export function upsertPayment(payment: PaymentRecord): PaymentRecord {
  const db = readDb();
  db.payments[payment.id] = payment;
  db.updatedAt = new Date().toISOString();
  writeDb(db);
  return payment;
}

export function getPayment(id: string): PaymentRecord | null {
  const db = readDb();
  return db.payments[id] || null;
}

export function listPayments(businessId?: string): PaymentRecord[] {
  const db = readDb();
  const payments = Object.values(db.payments);
  return businessId ? payments.filter((payment) => payment.business_id === businessId) : payments;
}

export function loadTaxSheet(businessId: string): TaxSheet {
  const db = readDb();
  return (
    db.taxSheets[businessId] || {
      business_id: businessId,
      entries: [],
      total_income_cents: 0,
      last_updated: new Date().toISOString(),
    }
  );
}

export function saveTaxSheet(sheet: TaxSheet): TaxSheet {
  const db = readDb();
  db.taxSheets[sheet.business_id] = sheet;
  db.updatedAt = new Date().toISOString();
  writeDb(db);
  return sheet;
}

export function recordTaxIncome(businessId: string, invoiceId: string, amountCents: number): { entry: TaxEntry; sheet: TaxSheet } {
  const sheet = loadTaxSheet(businessId);
  const entry: TaxEntry = {
    id: `tax-${Date.now()}`,
    business_id: businessId,
    invoice_id: invoiceId,
    amount_cents: amountCents,
    recorded_at: new Date().toISOString(),
  };

  sheet.entries.push(entry);
  sheet.total_income_cents += amountCents;
  sheet.last_updated = new Date().toISOString();
  saveTaxSheet(sheet);

  return { entry, sheet };
}

export function saveCalendarTokens(businessId: string, tokens: unknown): void {
  const db = readDb();
  db.calendarTokens[businessId] = tokens;
  db.updatedAt = new Date().toISOString();
  writeDb(db);
}

export function loadCalendarTokens(businessId: string): unknown | null {
  const db = readDb();
  return db.calendarTokens[businessId] || null;
}

function calendarKey(businessId: string, calendarId: string): string {
  return `${businessId}:${calendarId}`;
}

function loadCalendarEventsBucket(db: AppDatabase, businessId: string, calendarId: string): CalendarEvent[] {
  const key = calendarKey(businessId, calendarId);
  return db.calendarEvents[key] || [];
}

function saveCalendarEventsBucket(db: AppDatabase, businessId: string, calendarId: string, events: CalendarEvent[]): void {
  const key = calendarKey(businessId, calendarId);
  db.calendarEvents[key] = events;
}

export function listCalendarEvents(businessId: string, calendarId = 'primary'): CalendarEvent[] {
  const db = readDb();
  return loadCalendarEventsBucket(db, businessId, calendarId);
}

export function upsertCalendarEvent(event: Omit<CalendarEvent, 'created_at' | 'updated_at'> & Partial<Pick<CalendarEvent, 'created_at' | 'updated_at'>>): CalendarEvent {
  const db = readDb();
  const bucket = loadCalendarEventsBucket(db, event.business_id, event.calendar_id);
  const now = new Date().toISOString();
  const next: CalendarEvent = {
    ...event,
    created_at: event.created_at || now,
    updated_at: now,
    status: event.status || 'confirmed',
  };
  const index = bucket.findIndex((existing) => existing.id === event.id);
  if (index >= 0) {
    bucket[index] = next;
  } else {
    bucket.push(next);
  }
  saveCalendarEventsBucket(db, event.business_id, event.calendar_id, bucket);
  db.updatedAt = now;
  writeDb(db);
  return next;
}

export function deleteCalendarEvent(businessId: string, calendarId: string, eventId: string): boolean {
  const db = readDb();
  const bucket = loadCalendarEventsBucket(db, businessId, calendarId);
  const next = bucket.filter((event) => event.id !== eventId);
  if (next.length === bucket.length) {
    return false;
  }
  saveCalendarEventsBucket(db, businessId, calendarId, next);
  db.updatedAt = new Date().toISOString();
  writeDb(db);
  return true;
}
