import "server-only";
import { and, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, type CriteriaContent, type JdContent } from "@/lib/db/schema";
import { documentKindLabel } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { audit } from "@/lib/audit";

/** B4: published posts close by themselves at the closing date and time. */
export async function closeExpiredAdverts() {
  const due = (await db
    .select({ id: adverts.id, positionId: adverts.positionId })
    .from(adverts)
    .where(and(eq(adverts.status, "published"), lte(adverts.closingAt, new Date().toISOString())))
    );
  for (const a of due) {
    await db.update(adverts).set({ status: "closed", updatedAt: new Date().toISOString() }).where(eq(adverts.id, a.id));
    await audit(null, "advert_closed", "position", a.positionId, "Closing date reached");
  }
  return due.length;
}

type PositionLike = { title: string; department: string; grade: string; posts: number; type: string; rank: string; discipline: string };

/** B1: the ad in DU format, built from the JD and criteria. HR edits it before publishing. */
export function generateAdvertBody(p: PositionLike, jd: JdContent | null, criteria: CriteriaContent | null, closingAt: string) {
  const parts = [
    `DAANISH UNIVERSITY`,
    `Invites applications for the following ${p.posts === 1 ? "post" : `${p.posts} posts`}:`,
    `${p.title}, ${p.department} (${p.grade})`,
  ];
  if (jd?.summary) parts.push(jd.summary);
  if (jd?.duties.length) parts.push(`Main duties:\n${jd.duties.map((d) => `• ${d}`).join("\n")}`);
  const mandatory = criteria?.items.filter((c) => c.mandatory).map((c) => c.label) ?? [];
  const desirable = criteria?.items.filter((c) => !c.mandatory).map((c) => c.label) ?? [];
  const required = [...(jd?.requiredQualifications ?? []), ...mandatory];
  if (required.length) parts.push(`Eligibility:\n${[...new Set(required)].map((d) => `• ${d}`).join("\n")}`);
  const preferred = [...(jd?.preferredQualifications ?? []), ...desirable];
  if (preferred.length) parts.push(`Desirable:\n${[...new Set(preferred)].map((d) => `• ${d}`).join("\n")}`);
  if (jd?.requiredDocuments.length) parts.push(`Upload with your application: ${jd.requiredDocuments.map(documentKindLabel).join(", ")}.`);
  parts.push(
    `How to apply: apply online at careers.du.edu.pk by ${formatDate(closingAt)}. Only shortlisted candidates will be contacted. Daanish University is an equal opportunity employer; women and persons with disabilities are encouraged to apply.`,
  );
  return parts.join("\n\n");
}
