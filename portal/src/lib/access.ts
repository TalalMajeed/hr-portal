import "server-only";
import { and, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, events, panelMembers, panels, positions, reviewAssignments, conflicts } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth";

/** HR, the ED and the super admin see every position. Hiring leads see the ones they lead. */
export function canManagePosition(user: SessionUser, position: { hiringLeadId: number | null; createdBy: number | null }) {
  if (["super_admin", "ed", "hr"].includes(user.role)) return true;
  return user.role === "hiring_lead" && (position.hiringLeadId === user.id || position.createdBy === user.id);
}

/** Positions a staff member can open. `null` means all of them. */
export async function visiblePositionIds(user: SessionUser): Promise<number[] | null> {
  if (["super_admin", "ed", "hr"].includes(user.role)) return null;
  if (user.role === "hiring_lead") {
    return (await db
      .select({ id: positions.id })
      .from(positions)
      .where(or(eq(positions.hiringLeadId, user.id), eq(positions.createdBy, user.id)))
      )
      .map((p) => p.id);
  }
  return [];
}

/** Panel members see only candidates they are scheduled to meet and have not declared a conflict with. */
export async function panelApplicationIds(userId: number): Promise<number[]> {
  const memberships = (await db
    .select({ panelId: panelMembers.panelId })
    .from(panelMembers)
    .where(and(eq(panelMembers.userId, userId), eq(panelMembers.inviteStatus, "accepted")))
    )
    .map((m) => m.panelId);
  if (!memberships.length) return [];
  const appIds = (await db
    .select({ applicationId: events.applicationId })
    .from(events)
    .where(inArray(events.panelId, memberships))
    )
    .map((e) => e.applicationId);
  const conflicted = new Set(
    (await db
      .select({ applicationId: conflicts.applicationId })
      .from(conflicts)
      .where(and(eq(conflicts.userId, userId), eq(conflicts.hasConflict, true)))
      )
      .map((c) => c.applicationId),
  );
  return [...new Set(appIds)].filter((id) => !conflicted.has(id));
}

/** Confidentiality rule from the SRS, applied to an application and its files. */
export async function canViewApplication(user: SessionUser, applicationId: number) {
  const app = (await db.select().from(applications).where(eq(applications.id, applicationId)))[0];
  if (!app) return false;
  switch (user.role) {
    case "super_admin":
    case "ed":
    case "hr":
      return true;
    case "hiring_lead": {
      const p = (await db.select().from(positions).where(eq(positions.id, app.positionId)))[0];
      return !!p && canManagePosition(user, p);
    }
    case "candidate":
      return app.candidateId === user.id;
    case "agency":
      return app.agencyId === user.id;
    case "reviewer":
      return !!(await db
        .select()
        .from(reviewAssignments)
        .where(and(eq(reviewAssignments.applicationId, applicationId), eq(reviewAssignments.reviewerId, user.id)))
        )[0];
    case "panel":
      return (await panelApplicationIds(user.id)).includes(applicationId);
    case "board": {
      const p = (await db.select().from(positions).where(eq(positions.id, app.positionId)))[0];
      return !!p && p.stage === 10;
    }
    default:
      return false;
  }
}

export async function panelsForUser(userId: number) {
  return (await db
    .select({ panel: panels, member: panelMembers })
    .from(panelMembers)
    .innerJoin(panels, eq(panels.id, panelMembers.panelId))
    .where(eq(panelMembers.userId, userId))
    );
}

/** Loads a position for a staff page, or shows 404 when it doesn't exist or the user can't manage it. */
export async function positionForPage(user: SessionUser, id: string | number) {
  const { notFound } = await import("next/navigation");
  const p = (await db.select().from(positions).where(eq(positions.id, Number(id))))[0];
  if (!p || !canManagePosition(user, p)) notFound();
  return p!;
}
