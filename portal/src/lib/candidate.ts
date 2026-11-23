import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, candidateProfiles, documents, positions, users } from "@/lib/db/schema";
import { emptyProfile } from "@/lib/applications";
import { sendEmail } from "@/lib/email";

export function getProfile(userId: number) {
  return db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)).get() ?? emptyProfile(userId);
}

/** The candidate's own profile documents (not ones attached to a single application). */
export function profileDocuments(userId: number) {
  return db
    .select()
    .from(documents)
    .where(and(eq(documents.ownerUserId, userId), isNull(documents.applicationId)))
    .all();
}

export function advertIsOpen(a: { status: string; closingAt: string } | null | undefined) {
  return !!a && a.status === "published" && a.closingAt > new Date().toISOString();
}

/** A post by its public code, with its advert. */
export function postByCode(code: string) {
  return (
    db
      .select({ position: positions, advert: adverts })
      .from(positions)
      .innerJoin(adverts, eq(adverts.positionId, positions.id))
      .where(eq(positions.code, code))
      .get() ?? null
  );
}

/** Emails every active HR officer, for candidate replies to invitations and offers. */
export function emailHr(subject: string, body: string, ctx: { applicationId?: number; positionId?: number } = {}) {
  const hr = db
    .select()
    .from(users)
    .where(and(eq(users.role, "hr"), eq(users.active, true)))
    .all();
  for (const u of hr) sendEmail({ email: u.email, userId: u.id }, subject, `Dear ${u.name},\n\n${body}\n\nDU Job Portal`, ctx);
}

/** Invitations stay on the dashboard until a day after they start. */
export function invitationCutoff() {
  return new Date(Date.now() - 86_400_000).toISOString();
}
