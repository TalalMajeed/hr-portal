import "server-only";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Postgres through node-postgres. DATABASE_URL is any Postgres connection string;
 * in production it is Neon's pooled endpoint. Schema changes go through the
 * migrations folder (npm run db:generate, then npm run db:migrate), never by hand.
 */
function createPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  return new Pool({ connectionString: url, max: process.env.VERCEL ? 3 : 10, idleTimeoutMillis: 10_000 });
}

const globalForDb = globalThis as unknown as { __duPool?: Pool };
export const pool = globalForDb.__duPool ?? createPool();
globalForDb.__duPool = pool;

export const db = drizzle(pool, { schema });
export type Db = typeof db;
export { schema };
