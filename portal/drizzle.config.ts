import { defineConfig } from "drizzle-kit";

/**
 * Schema changes: edit src/lib/db/schema.ts, run `npm run db:generate` to write a
 * new SQL file into ./migrations, review it, commit it, then `npm run db:migrate`.
 * Deploys run pending migrations before building.
 */
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "" },
  strict: true,
  verbose: true,
});
