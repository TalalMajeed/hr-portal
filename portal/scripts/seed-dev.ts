/**
 * Development accounts: one for every role, plus an external reviewer and an external
 * panelist who sign in through a secure link. Accounts only, no positions or applications.
 *
 *   npm run db:seed:dev
 *
 * Refuses to run against anything but a local database, so it can never touch Neon or
 * production. Safe to run again: existing dev accounts get their password and role reset.
 * The shared password is listed in CLAUDE.md.
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import * as schema from "../src/lib/db/schema";
import type { Role } from "../src/lib/db/schema";

export const DEV_PASSWORD = "DevPass-2026";

type Account = {
  email: string;
  name: string;
  role: Role;
  designation: string;
  organisation: string;
  department?: string;
  discipline?: string;
  /** External reviewers and panelists sign in through /x/<token> instead of a password. */
  externalToken?: string;
};

export const DEV_ACCOUNTS: Account[] = [
  { email: "superadmin@du.test", name: "Dev Super Admin", role: "super_admin", designation: "IT Manager", organisation: "Daanish University", department: "Information Technology" },
  { email: "ed@du.test", name: "Dev Executive Director", role: "ed", designation: "Executive Director", organisation: "Daanish University" },
  { email: "hr@du.test", name: "Dev HR Officer", role: "hr", designation: "Recruitment Officer", organisation: "Daanish University", department: "Human Resources" },
  { email: "lead@du.test", name: "Dev Hiring Lead", role: "hiring_lead", designation: "Dean of Sciences", organisation: "Daanish University", department: "Mathematics", discipline: "Mathematics" },
  { email: "reviewer@du.test", name: "Dev Reviewer", role: "reviewer", designation: "Associate Professor", organisation: "Daanish University", discipline: "Mathematics" },
  { email: "panel@du.test", name: "Dev Panel Member", role: "panel", designation: "Professor", organisation: "Daanish University", discipline: "Mathematics" },
  { email: "board@du.test", name: "Dev Board Member", role: "board", designation: "Chairperson, Selection Board", organisation: "Daanish University" },
  { email: "agency@du.test", name: "Dev Agency", role: "agency", designation: "Executive search", organisation: "Dev Recruiters" },
  { email: "candidate@du.test", name: "Dev Candidate", role: "candidate", designation: "", organisation: "" },
  {
    email: "external.reviewer@du.test",
    name: "Dev External Reviewer",
    role: "reviewer",
    designation: "Professor",
    organisation: "Partner University",
    discipline: "Mathematics",
    externalToken: "dev-external-reviewer-link-000000",
  },
  {
    email: "external.panel@du.test",
    name: "Dev External Panelist",
    role: "panel",
    designation: "Professor",
    organisation: "Partner University",
    discipline: "Mathematics",
    externalToken: "dev-external-panel-link-0000000000",
  },
];

function assertLocal(url: string) {
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "::1"].includes(host) || process.env.VERCEL_ENV || process.env.NODE_ENV === "production") {
    throw new Error(`Refusing to seed development accounts into ${host}. This script only runs against a local database.`);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Set DATABASE_URL (npm run db:seed:dev reads .env.local).");
  assertLocal(url);
  const pool = new Pool({ connectionString: url, max: 1 });
  const db = drizzle(pool, { schema });
  const hash = bcrypt.hashSync(DEV_PASSWORD, 10);

  for (const a of DEV_ACCOUNTS) {
    const values = {
      name: a.name,
      role: a.role,
      designation: a.designation,
      organisation: a.organisation,
      department: a.department ?? "",
      discipline: a.discipline ?? "",
      phone: "+92 300 0000000",
      external: !!a.externalToken,
      accessToken: a.externalToken ?? null,
      passwordHash: a.externalToken ? null : hash,
      emailVerified: true,
      active: true,
    };
    const existing = (await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, a.email)))[0];
    const id = existing
      ? (await db.update(schema.users).set(values).where(eq(schema.users.id, existing.id)).returning({ id: schema.users.id }))[0].id
      : (await db.insert(schema.users).values({ email: a.email, ...values }).returning({ id: schema.users.id }))[0].id;
    if (a.role === "candidate") {
      await db
        .insert(schema.candidateProfiles)
        .values({ userId: id, country: "Pakistan", timezone: "Asia/Karachi", city: "Islamabad", province: "Islamabad Capital Territory" })
        .onConflictDoNothing();
    }
    console.log(`${existing ? "updated" : "created"}  ${a.role.padEnd(12)} ${a.email}`);
  }
  await pool.end();
  console.log(`\nPassword for every account: ${DEV_PASSWORD}`);
  console.log("External accounts sign in at http://localhost:3000/x/<token> (tokens are in scripts/seed-dev.ts).");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
