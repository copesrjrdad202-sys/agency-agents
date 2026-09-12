import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

/**
 * Shared SQLite database for multi-tenant business config, call logs, and API keys.
 * Uses Node's built-in `node:sqlite` module (Node 22.5+) so there is zero native
 * build dependency — this keeps the service trivially deployable to any host.
 */

const dataDir = path.resolve(config.dataDir);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'voice-ai-agent.db');
export const db = new DatabaseSync(dbPath);

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS businesses (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    business_type TEXT NOT NULL DEFAULT 'Home Services',
    hours TEXT NOT NULL DEFAULT 'Mon-Fri 8am-6pm',
    service_area TEXT NOT NULL DEFAULT 'the local area',
    twilio_number TEXT UNIQUE,
    forwarding_number TEXT,
    calendar_provider TEXT NOT NULL DEFAULT 'mock',
    google_calendar_id TEXT,
    voice_name TEXT NOT NULL DEFAULT 'en-US-Neural2-F',
    language_code TEXT NOT NULL DEFAULT 'en-US',
    system_prompt_override TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_businesses_twilio_number ON businesses(twilio_number);

  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    business_id TEXT NOT NULL,
    call_sid TEXT,
    caller_phone TEXT,
    session_id TEXT NOT NULL,
    transcript TEXT NOT NULL DEFAULT '[]',
    outcome TEXT,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    FOREIGN KEY (business_id) REFERENCES businesses(id)
  );

  CREATE INDEX IF NOT EXISTS idx_calls_business_id ON calls(business_id);
  CREATE INDEX IF NOT EXISTS idx_calls_session_id ON calls(session_id);

  CREATE TABLE IF NOT EXISTS api_keys (
    key_hash TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    business_id TEXT,
    created_at INTEGER NOT NULL
  );
`);

export function nowMs(): number {
  return Date.now();
}
