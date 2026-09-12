import { randomUUID } from 'crypto';
import { db, nowMs } from '../db/database';
import { config } from '../config';

export interface BusinessRecord {
  id: string;
  name: string;
  businessType: string;
  hours: string;
  serviceArea: string;
  twilioNumber: string | null;
  forwardingNumber: string | null;
  calendarProvider: 'mock' | 'google' | 'multi-agent';
  googleCalendarId: string | null;
  voiceName: string;
  languageCode: string;
  systemPromptOverride: string | null;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

interface BusinessRow {
  id: string;
  name: string;
  business_type: string;
  hours: string;
  service_area: string;
  twilio_number: string | null;
  forwarding_number: string | null;
  calendar_provider: string;
  google_calendar_id: string | null;
  voice_name: string;
  language_code: string;
  system_prompt_override: string | null;
  active: number;
  created_at: number;
  updated_at: number;
}

function rowToRecord(row: BusinessRow): BusinessRecord {
  return {
    id: row.id,
    name: row.name,
    businessType: row.business_type,
    hours: row.hours,
    serviceArea: row.service_area,
    twilioNumber: row.twilio_number,
    forwardingNumber: row.forwarding_number,
    calendarProvider: row.calendar_provider as BusinessRecord['calendarProvider'],
    googleCalendarId: row.google_calendar_id,
    voiceName: row.voice_name,
    languageCode: row.language_code,
    systemPromptOverride: row.system_prompt_override,
    active: !!row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateBusinessInput {
  name: string;
  businessType?: string;
  hours?: string;
  serviceArea?: string;
  twilioNumber?: string;
  forwardingNumber?: string;
  calendarProvider?: BusinessRecord['calendarProvider'];
  googleCalendarId?: string;
  voiceName?: string;
  languageCode?: string;
  systemPromptOverride?: string;
}

export function createBusiness(input: CreateBusinessInput): BusinessRecord {
  const id = randomUUID();
  const ts = nowMs();
  const stmt = db.prepare(`
    INSERT INTO businesses (
      id, name, business_type, hours, service_area, twilio_number, forwarding_number,
      calendar_provider, google_calendar_id, voice_name, language_code,
      system_prompt_override, active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  stmt.run(
    id,
    input.name,
    input.businessType || 'Home Services',
    input.hours || 'Mon-Fri 8am-6pm',
    input.serviceArea || 'the local area',
    input.twilioNumber || null,
    input.forwardingNumber || null,
    input.calendarProvider || 'mock',
    input.googleCalendarId || null,
    input.voiceName || 'en-US-Neural2-F',
    input.languageCode || 'en-US',
    input.systemPromptOverride || null,
    ts,
    ts
  );
  return getBusinessById(id)!;
}

export function updateBusiness(id: string, updates: Partial<CreateBusinessInput> & { active?: boolean }): BusinessRecord | undefined {
  const existing = getBusinessById(id);
  if (!existing) return undefined;

  const merged: CreateBusinessInput & { active?: boolean } = {
    ...existing,
    twilioNumber: existing.twilioNumber ?? undefined,
    forwardingNumber: existing.forwardingNumber ?? undefined,
    googleCalendarId: existing.googleCalendarId ?? undefined,
    systemPromptOverride: existing.systemPromptOverride ?? undefined,
    ...updates,
  };
  const stmt = db.prepare(`
    UPDATE businesses SET
      name = ?, business_type = ?, hours = ?, service_area = ?, twilio_number = ?,
      forwarding_number = ?, calendar_provider = ?, google_calendar_id = ?,
      voice_name = ?, language_code = ?, system_prompt_override = ?, active = ?, updated_at = ?
    WHERE id = ?
  `);
  stmt.run(
    merged.name,
    merged.businessType || 'Home Services',
    merged.hours || 'Mon-Fri 8am-6pm',
    merged.serviceArea || 'the local area',
    merged.twilioNumber || null,
    merged.forwardingNumber || null,
    merged.calendarProvider || 'mock',
    merged.googleCalendarId || null,
    merged.voiceName || 'en-US-Neural2-F',
    merged.languageCode || 'en-US',
    merged.systemPromptOverride || null,
    updates.active === undefined ? (existing.active ? 1 : 0) : (updates.active ? 1 : 0),
    nowMs(),
    id
  );
  return getBusinessById(id);
}

export function deleteBusiness(id: string): boolean {
  const stmt = db.prepare('DELETE FROM businesses WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getBusinessById(id: string): BusinessRecord | undefined {
  const stmt = db.prepare('SELECT * FROM businesses WHERE id = ?');
  const row = stmt.get(id) as BusinessRow | undefined;
  return row ? rowToRecord(row) : undefined;
}

export function getBusinessByTwilioNumber(twilioNumber: string): BusinessRecord | undefined {
  const stmt = db.prepare('SELECT * FROM businesses WHERE twilio_number = ? AND active = 1');
  const row = stmt.get(twilioNumber) as BusinessRow | undefined;
  return row ? rowToRecord(row) : undefined;
}

export function listBusinesses(): BusinessRecord[] {
  const stmt = db.prepare('SELECT * FROM businesses ORDER BY created_at DESC');
  const rows = stmt.all() as unknown as BusinessRow[];
  return rows.map(rowToRecord);
}

/**
 * Fallback business used when no Twilio number mapping is found (e.g. the
 * browser demo, or a single-tenant deployment relying on the legacy .env config).
 */
export function getDefaultBusinessConfig(): BusinessRecord {
  return {
    id: 'default',
    name: config.business.name,
    businessType: config.business.type,
    hours: config.business.hours,
    serviceArea: config.business.serviceArea,
    twilioNumber: null,
    forwardingNumber: null,
    calendarProvider: config.calendar.provider,
    googleCalendarId: config.calendar.googleCalendarId,
    voiceName: config.tts.voiceName,
    languageCode: config.tts.languageCode,
    systemPromptOverride: null,
    active: true,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Resolve a business by the Twilio "To" number, falling back to the default env config. */
export function resolveBusinessForNumber(toNumber?: string | null): BusinessRecord {
  if (toNumber) {
    const match = getBusinessByTwilioNumber(toNumber);
    if (match) return match;
  }
  return getDefaultBusinessConfig();
}
