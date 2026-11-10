import { DatabaseSync } from "node:sqlite";
import { config, ensureDirs } from "./config.js";

let db: DatabaseSync | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  account_id INTEGER PRIMARY KEY,
  website TEXT,
  offer TEXT,
  buyers TEXT,
  roles TEXT,
  region TEXT,
  exclusions TEXT,
  target_list TEXT,
  sources TEXT,
  brief_complete INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  name TEXT,
  role TEXT,
  company TEXT,
  domain TEXT,
  linkedin TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  signal TEXT,
  signal_label TEXT,
  signal_date TEXT,
  signal_age_days INTEGER,
  source_url TEXT,
  reason TEXT,
  score REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0,
  fit TEXT NOT NULL DEFAULT 'unknown',
  fit_reason TEXT,
  credits_spent REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(account_id, domain, signal, signal_date)
);
CREATE TABLE IF NOT EXISTS signals (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  lead_id INTEGER,
  domain TEXT,
  source TEXT,
  type TEXT,
  label TEXT,
  date TEXT,
  source_url TEXT,
  detail TEXT,
  points REAL
);
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  sender TEXT NOT NULL DEFAULT 'manual',
  send_automatically INTEGER NOT NULL DEFAULT 0,
  warm_up INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sequences (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  step INTEGER NOT NULL,
  body TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS campaign_leads (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'queued',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(campaign_id, lead_id)
);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER,
  lead_id INTEGER,
  type TEXT NOT NULL,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS linkedin_accounts (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  handle TEXT,
  status TEXT NOT NULL DEFAULT 'disconnected'
);
CREATE TABLE IF NOT EXISTS credits_ledger (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  delta REAL NOT NULL,
  reason TEXT,
  at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'noted',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function ensureColumn(conn: DatabaseSync, table: string, column: string, ddl: string): void {
  const cols = conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function migrate(conn: DatabaseSync): void {
  ensureColumn(conn, "settings", "sources", "TEXT");
  ensureColumn(conn, "leads", "source", "TEXT");
  ensureColumn(conn, "leads", "confidence", "REAL NOT NULL DEFAULT 0");
  ensureColumn(conn, "leads", "fit_reason", "TEXT");
  ensureColumn(conn, "leads", "credits_spent", "REAL NOT NULL DEFAULT 0");
  ensureColumn(conn, "signals", "source", "TEXT");
  ensureColumn(conn, "campaigns", "sender", "TEXT NOT NULL DEFAULT 'manual'");
}

export function getDb(): DatabaseSync {
  if (db) return db;
  ensureDirs();
  db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);
  seed(db);
  return db;
}

function seed(conn: DatabaseSync): void {
  const existing = conn.prepare("SELECT id FROM accounts WHERE id = 1").get() as { id?: number } | undefined;
  if (!existing) {
    conn.prepare("INSERT INTO accounts (id, name, email) VALUES (1, ?, ?)").run("LetMeLead", "");
    conn.prepare(
      `INSERT INTO settings (account_id, website, offer, buyers, roles, region, exclusions, target_list, sources, brief_complete, updated_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))`
    ).run(
      "",
      "",
      JSON.stringify([]),
      JSON.stringify(["founder", "ceo", "cto", "vp engineering", "head of engineering", "head of marketing", "head of sales", "operations", "procurement", "security", "compliance"]),
      "Global (English-speaking)",
      JSON.stringify([]),
      "",
      JSON.stringify([])
    );
    conn.prepare("INSERT INTO linkedin_accounts (account_id, handle, status) VALUES (1, ?, 'disconnected')").run("");
    conn.prepare("INSERT INTO credits_ledger (account_id, delta, reason) VALUES (1, 0, 'initial')").run();
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
