import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import * as schema from "../../src/lib/db/schema";

/** The seed opens its own connection: src/lib/db is server-only. */
export const sqlite = new Database(process.env.DATABASE_PATH ?? path.resolve("data/portal.db"));
sqlite.pragma("foreign_keys = ON");
export const db = drizzle(sqlite, { schema });
export { schema };

export const DAY = 86_400_000;
export const now = Date.now();
export const daysAgo = (n: number, hour = 10) => {
  const d = new Date(now - n * DAY);
  d.setUTCHours(hour - 5, 0, 0, 0); // hour in PKT
  return d.toISOString();
};
export const daysAhead = (n: number, hour = 10) => daysAgo(-n, hour);
