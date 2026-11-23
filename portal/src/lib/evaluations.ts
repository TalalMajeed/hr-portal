import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, events, evaluations, panelMembers, panels, users, type PanelRound } from "@/lib/db/schema";
import { getDoc, EMPTY_RUBRIC } from "@/lib/positions";
import { weightedTotal, rankByTotal } from "@/lib/scoring";
import { average } from "@/lib/format";
import { eventPanelists } from "@/lib/scheduling";

/**
 * Every evaluation that should exist for a position: one per accepted, unconflicted panel member
 * per session that went ahead. `evaluation` is null when the member hasn't started.
 */
export function expectedEvaluations(positionId: number, round?: PanelRound) {
  const evs = db
    .select({ event: events, app: applications, candidate: users })
    .from(events)
    .innerJoin(applications, eq(applications.id, events.applicationId))
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(and(eq(events.positionId, positionId), inArray(events.status, ["confirmed", "completed", "invited", "reschedule_requested"])))
    .all()
    .filter((r) => !round || r.event.round === round);
  const out: {
    event: typeof events.$inferSelect;
    app: typeof applications.$inferSelect;
    candidate: typeof users.$inferSelect;
    panelist: typeof users.$inferSelect;
    isChair: boolean;
    evaluation: typeof evaluations.$inferSelect | null;
  }[] = [];
  for (const r of evs) {
    for (const m of eventPanelists(r.event)) {
      const evaluation = db.select().from(evaluations).where(and(eq(evaluations.eventId, r.event.id), eq(evaluations.panelistId, m.user.id))).get() ?? null;
      out.push({ ...r, panelist: m.user, isChair: m.member.isChair, evaluation });
    }
  }
  return out;
}

/** G5: the consolidated score sheet for one round. */
export function scoreSheet(positionId: number, round: PanelRound) {
  const rubric = getDoc(positionId, "rubric") ?? { ...EMPTY_RUBRIC, _version: 0 };
  const items = rubric[round] ?? [];
  const expected = expectedEvaluations(positionId, round);
  const byApp = new Map<number, { app: (typeof expected)[number]["app"]; candidate: (typeof expected)[number]["candidate"]; rows: typeof expected }>();
  for (const e of expected) {
    const entry = byApp.get(e.app.id) ?? { app: e.app, candidate: e.candidate, rows: [] };
    entry.rows.push(e);
    byApp.set(e.app.id, entry);
  }
  const panelists = [...new Map(expected.map((e) => [e.panelist.id, e.panelist])).values()];
  const rows = [...byApp.values()].map((entry) => {
    const submitted = entry.rows.filter((r) => r.evaluation?.status === "submitted");
    const totals = submitted.map((r) => weightedTotal(r.evaluation!.scores, items)).filter((n): n is number => n !== null);
    return {
      ...entry,
      submittedCount: submitted.length,
      expectedCount: entry.rows.length,
      total: average(totals),
      memberTotals: Object.fromEntries(entry.rows.map((r) => [r.panelist.id, r.evaluation?.status === "submitted" ? weightedTotal(r.evaluation.scores, items) : null])),
    };
  });
  return { items, panelists, rows: rankByTotal(rows) };
}

/** Rounds that have sessions for this position, in order. */
export function roundsWithEvents(positionId: number): PanelRound[] {
  const set = new Set(db.select({ round: events.round }).from(events).where(eq(events.positionId, positionId)).all().map((r) => r.round));
  return (["interview", "talk", "second_round"] as PanelRound[]).filter((r) => set.has(r));
}

/** The accepted chair of a position's panel for a round, if any. */
export function chairFor(positionId: number, round: PanelRound) {
  const panel = db.select().from(panels).where(and(eq(panels.positionId, positionId), eq(panels.round, round))).get();
  if (!panel) return null;
  const chair = db
    .select({ user: users })
    .from(panelMembers)
    .innerJoin(users, eq(users.id, panelMembers.userId))
    .where(and(eq(panelMembers.panelId, panel.id), eq(panelMembers.isChair, true)))
    .get();
  return chair?.user ?? null;
}
