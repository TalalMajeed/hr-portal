import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, approvals, panels, positions } from "@/lib/db/schema";
import { ROUND_LABELS } from "@/lib/constants";

export type PendingItem = {
  kind: "position" | "advert" | "shortlist" | "panel";
  positionId: number;
  code: string;
  title: string;
  waitingOn: "HR" | "ED";
  detail: string;
  since: string;
  href: string;
};

/** Everything waiting for HR or the ED: positions, ads, shortlists and panels. */
export async function pendingApprovals(): Promise<PendingItem[]> {
  const items: PendingItem[] = [];
  const all = (await db.select().from(positions));
  const byId = new Map(all.map((p) => [p.id, p]));
  const lastStep = async (positionId: number, subject: "position" | "advert" | "shortlist" | "panel") =>
    (await db.select().from(approvals).where(eq(approvals.positionId, positionId)).orderBy(desc(approvals.id))).find((a) => a.subject === subject);

  for (const p of all) {
    if (p.approvalStatus === "hr_review" || p.approvalStatus === "ed_review") {
      items.push({
        kind: "position",
        positionId: p.id,
        code: p.code,
        title: p.title,
        waitingOn: p.approvalStatus === "hr_review" ? "HR" : "ED",
        detail: "New position request",
        since: (await lastStep(p.id, "position"))?.createdAt ?? p.updatedAt,
        href: `/admin/positions/${p.id}`,
      });
    }
    const sl = await lastStep(p.id, "shortlist");
    if (sl?.action === "submitted" && !p.shortlistApproved) {
      items.push({ kind: "shortlist", positionId: p.id, code: p.code, title: p.title, waitingOn: "ED", detail: "Shortlist", since: sl.createdAt, href: `/admin/positions/${p.id}/applications` });
    }
  }

  const pendingAds = (await db.select().from(adverts).where(eq(adverts.status, "pending_approval")));
  for (const a of pendingAds) {
    const p = byId.get(a.positionId);
    if (!p) continue;
    items.push({ kind: "advert", positionId: p.id, code: p.code, title: p.title, waitingOn: "ED", detail: "Advertisement", since: a.updatedAt, href: `/admin/positions/${p.id}/advert` });
  }

  const pendingPanels = (await db.select().from(panels).where(inArray(panels.status, ["pending_approval"])));
  for (const pn of pendingPanels) {
    const p = byId.get(pn.positionId);
    if (!p) continue;
    items.push({
      kind: "panel",
      positionId: p.id,
      code: p.code,
      title: p.title,
      waitingOn: "ED",
      detail: `${ROUND_LABELS[pn.round]} panel`,
      since: (await lastStep(p.id, "panel"))?.createdAt ?? pn.createdAt,
      href: `/admin/positions/${p.id}/panels`,
    });
  }
  return items.sort((a, b) => a.since.localeCompare(b.since));
}
