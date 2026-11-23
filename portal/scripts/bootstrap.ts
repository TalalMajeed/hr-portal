/**
 * One-off setup for a fresh database, after `npm run db:migrate`:
 *   - settings, email templates and JD templates the app needs (skips any that exist)
 *   - the first super admin, from ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD, if none exists
 *
 * Safe to run again: it never overwrites anything.
 *   DATABASE_URL=... ADMIN_EMAIL=... ADMIN_NAME=... ADMIN_PASSWORD=... npm run db:bootstrap
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/lib/db/schema";
import { EMAIL_TEMPLATES, JD_TEMPLATES } from "./defaults";

const { settings, emailTemplates, jdTemplates, users } = schema;

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL.");
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });

  await db
    .insert(settings)
    .values([
      { key: "max_upload_mb", value: "4" },
      { key: "org_name", value: "Daanish University" },
      { key: "from_address", value: "careers@du.edu.pk" },
      { key: "retention_months", value: "24" },
    ])
    .onConflictDoNothing();
  await db.insert(emailTemplates).values(EMAIL_TEMPLATES).onConflictDoNothing();
  if (!(await db.select({ id: jdTemplates.id }).from(jdTemplates).limit(1)).length) {
    await db.insert(jdTemplates).values(JD_TEMPLATES);
  }
  console.log("Settings and templates are in place.");

  const admins = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
  if (admins.length) {
    console.log("A super admin already exists. No account created.");
  } else {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const name = process.env.ADMIN_NAME?.trim() || "Portal administrator";
    const password = process.env.ADMIN_PASSWORD ?? "";
    if (!email || password.length < 12) throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters to create the first super admin.");
    await db.insert(users).values({
      name,
      email,
      role: "super_admin",
      passwordHash: bcrypt.hashSync(password, 12),
      organisation: "Daanish University",
      emailVerified: true,
    });
    console.log(`Created the super admin ${email}. Change the password after first sign-in.`);
  }
  await pool.end();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
