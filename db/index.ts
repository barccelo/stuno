import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

function getD1() {
  if (!env.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Configure the DB binding in wrangler.jsonc before using the database."
    );
  }

  return env.DB;
}

export async function ensureSchema() {
  const d1 = getD1();
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY NOT NULL,
      state TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS category_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      easy TEXT NOT NULL,
      medium TEXT NOT NULL,
      expert TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS category_set_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      set_name TEXT NOT NULL,
      fingerprint TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS category_set_name_idx
      ON category_set_memberships (set_name)`),
  ]);
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
