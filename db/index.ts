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
      normal_enabled INTEGER NOT NULL DEFAULT 1,
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
    d1.prepare(`CREATE TABLE IF NOT EXISTS voice_signals (
      id TEXT PRIMARY KEY NOT NULL,
      room_code TEXT NOT NULL,
      from_player_id TEXT NOT NULL,
      to_player_id TEXT NOT NULL,
      type TEXT NOT NULL,
      sdp TEXT,
      created_at INTEGER NOT NULL
    )`),
    d1.prepare(`CREATE INDEX IF NOT EXISTS voice_signals_room_time_idx
      ON voice_signals (room_code, created_at)`),
  ]);

  const info = await d1.prepare("PRAGMA table_info(category_cards)").all();
  const columns = (info.results ?? []) as { name?: string }[];
  if (!columns.some((column) => column.name === "normal_enabled")) {
    try {
      await d1
        .prepare("ALTER TABLE category_cards ADD COLUMN normal_enabled INTEGER NOT NULL DEFAULT 1")
        .run();
    } catch (error) {
      if (!String(error).toLocaleLowerCase().includes("duplicate column")) throw error;
    }
  }
}

export function getDb() {
  return drizzle(getD1(), { schema });
}
