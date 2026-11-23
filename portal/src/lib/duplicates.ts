import "server-only";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, candidateProfiles, users } from "@/lib/db/schema";
import { audit } from "@/lib/audit";

const digits = (s: string) => s.replace(/\D/g, "");
const phoneKey = (s: string) => digits(s).slice(-10);
const emailKey = (s: string) => (s.endsWith("@placeholder.local") ? "" : s.trim().toLowerCase());

async function keysFor(candidateId: number) {
  const u = (await db.select().from(users).where(eq(users.id, candidateId)))[0];
  const p = (await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, candidateId)))[0];
  return { cnic: digits(p?.cnic ?? ""), email: emailKey(u?.email ?? ""), phone: phoneKey(u?.phone ?? "") };
}

/**
 * C11: finds another application on the same post from the same person (for example
 * once directly and once through an agency), matched on CNIC, email or mobile number.
 * The newer application is marked as a duplicate of the older one.
 */
export async function detectDuplicate(applicationId: number, actorId: number | null = null) {
  const app = (await db.select().from(applications).where(eq(applications.id, applicationId)))[0];
  if (!app) return null;
  const mine = await keysFor(app.candidateId);
  if (!mine.cnic && !mine.email && !mine.phone) return null;
  const others = (await db
    .select()
    .from(applications)
    .where(and(eq(applications.positionId, app.positionId), ne(applications.id, app.id), ne(applications.status, "draft")))
    );
  for (const other of others) {
    const k = await keysFor(other.candidateId);
    const match =
      (mine.cnic.length >= 13 && mine.cnic === k.cnic) || (!!mine.email && mine.email === k.email) || (mine.phone.length >= 10 && mine.phone === k.phone);
    if (!match) continue;
    const [older, newer] = other.id < app.id ? [other, app] : [app, other];
    await db.update(applications).set({ duplicateOfId: older.id }).where(eq(applications.id, newer.id));
    await audit(actorId, "duplicate_flagged", "application", newer.id, `Possible duplicate of ${older.appNo ?? older.id}`);
    return older;
  }
  return null;
}
