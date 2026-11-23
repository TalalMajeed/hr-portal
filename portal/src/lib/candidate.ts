import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, candidateProfiles, documents, positions, users } from "@/lib/db/schema";
import { emptyProfile } from "@/lib/applications";
import { sendEmail } from "@/lib/email";

export async function getProfile(userId: number) {
  return (await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, userId)))[0] ?? emptyProfile(userId);
}

/** The candidate's own profile documents (not ones attached to a single application). */
export async function profileDocuments(userId: number) {
  return (await db
    .select()
    .from(documents)
    .where(and(eq(documents.ownerUserId, userId), isNull(documents.applicationId)))
    );
}

export function advertIsOpen(a: { status: string; closingAt: string } | null | undefined) {
  return !!a && a.status === "published" && a.closingAt > new Date().toISOString();
}

/** A post by its public code, with its advert. */
export async function postByCode(code: string) {
  return (
    (await db
      .select({ position: positions, advert: adverts })
      .from(positions)
      .innerJoin(adverts, eq(adverts.positionId, positions.id))
      .where(eq(positions.code, code))
      )[0] ?? null
  );
}

/** Emails every active HR officer, for candidate replies to invitations and offers. */
export async function emailHr(subject: string, body: string, ctx: { applicationId?: number; positionId?: number } = {}) {
  const hr = (await db
    .select()
    .from(users)
    .where(and(eq(users.role, "hr"), eq(users.active, true)))
    );
  for (const u of hr) await sendEmail({ email: u.email, userId: u.id }, subject, `Dear ${u.name},\n\n${body}\n\nDU Job Portal`, ctx);
}

/** Invitations stay on the dashboard until a day after they start. */
export function invitationCutoff() {
  return new Date(Date.now() - 86_400_000).toISOString();
}
