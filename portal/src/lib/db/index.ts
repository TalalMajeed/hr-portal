import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

export const DATA_DIR = path.resolve(process.cwd(), "data");
export const DB_PATH = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "portal.db");

function open() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  return sqlite;
}

const globalForDb = globalThis as unknown as { __duSqlite?: Database.Database };
export const sqlite = globalForDb.__duSqlite ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__duSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
