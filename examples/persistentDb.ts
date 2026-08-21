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
  branding?: {
    displayName?: string;
    greeting?: string;
    brandColor?: string;
  };
  services: Service[];
  calendar?: {
    provider: 'google';
    credentialsPath?: string;
    calendarId?: string;
  } | null;
  invoiceTemplate?: string;
  taxSheetPath?: string;
  contact?: {
    phone?: string;
    email?: string;
  };
};

export type LocalInvoice = {
  id: string;
  status: 'draft' | 'open' | 'paid' | 'void';
  amount_due: number;
  currency: string;
  customer_email: string;
  description: string;
  metadata: Record<string, string>;
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

type AppDatabase = {
  businesses: Record<string, BusinessProfile>;
  invoices: Record<string, LocalInvoice>;
  taxSheets: Record<string, TaxSheet>;
  updatedAt: string;
};

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'app-db.json');
const LEGACY_BUSINESSES_PATH = path.join(DATA_DIR, 'businesses.json');

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
      taxSheets: {},
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readDb(): AppDatabase {
  ensureDbFile();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw) as Partial<AppDatabase>;
  return {
    businesses: parsed.businesses || {},
    invoices: parsed.invoices || {},
    taxSheets: parsed.taxSheets || {},
    updatedAt: parsed.updatedAt || new Date().toISOString(),
  };
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
  db.invoices[invoice.id] = invoice;
  db.updatedAt = new Date().toISOString();
  writeDb(db);
  return invoice;
}

export function getInvoice(id: string): LocalInvoice | null {
  const db = readDb();
  return db.invoices[id] || null;
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
