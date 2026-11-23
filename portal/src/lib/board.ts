import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  advertRuns,
  adverts,
  applications,
  boardDecisions,
  boards,
  conflicts,
  consensus,
  documents,
  evaluations,
  offers,
  panelMembers,
  panels,
  positions,
  reviewAssignments,
  users,
  type PanelRound,
  type RubricContent,
  type RubricItem,
  type Scores,
} from "@/lib/db/schema";
import { getDoc } from "@/lib/positions";
import { average } from "@/lib/format";
import { isEligible } from "@/lib/eligibility";

/** Weighted score out of 100 for one score sheet against a rubric round. */
export function weightedScore(scores: Scores, items: RubricItem[]) {
  if (!items.length) return null;
  const totalWeight = items.reduce((s, i) => s + i.weight, 0) || 1;
  let sum = 0;
  for (const i of items) {
    const v = scores[i.key];
    if (typeof v !== "number") return null;
    sum += (v / i.maxScore) * i.weight;
  }
  return (sum / totalWeight) * 100;
}

export type CandidateRow = {
  applicationId: number;
  appNo: string;
  name: string;
  status: string;
  listStatus: string;
  shortlistScore: number | null;
  rounds: Partial<Record<PanelRound, { avg: number | null; count: number; recommendations: string[] }>>;
  overall: number | null;
  consensusRank: number | null;
  decision: typeof boardDecisions.$inferSelect | null;
  offer: typeof offers.$inferSelect | null;
};

/** Everything the Selection Board pack needs (H1). */
export async function getBoardPack(positionId: number) {
  const position = (await db.select().from(positions).where(eq(positions.id, positionId)))[0];
  if (!position) return null;
  const board = (await db.select().from(boards).where(eq(boards.positionId, positionId)))[0] ?? null;
  const advert = (await db.select().from(adverts).where(eq(adverts.positionId, positionId)))[0] ?? null;
  const runs = (await db.select().from(advertRuns).where(eq(advertRuns.positionId, positionId)).orderBy(asc(advertRuns.runDate)));
  const rubric = (await getDoc(positionId, "rubric") ?? { shortlisting: [], interview: [], talk: [], second_round: [] }) as RubricContent;

  const apps = (await db
    .select({ a: applications, name: users.name })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(and(eq(applications.positionId, positionId)))
    )
    .filter((r) => r.a.status !== "draft");

  const appIds = apps.map((r) => r.a.id);
  const reviews = appIds.length ? (await db.select().from(reviewAssignments).where(inArray(reviewAssignments.applicationId, appIds))) : [];
  const evals = appIds.length ? (await db.select().from(evaluations).where(inArray(evaluations.applicationId, appIds))) : [];
  const decisions = (await db.select().from(boardDecisions).where(eq(boardDecisions.positionId, positionId)));
  const offerRows = (await db.select().from(offers).where(eq(offers.positionId, positionId)));
  const consensusRows = (await db.select().from(consensus).where(eq(consensus.positionId, positionId)));
  const finalConsensus =
    consensusRows.find((c) => c.round === "second_round" && c.ranking.length) ??
    consensusRows.find((c) => c.round === "talk" && c.ranking.length) ??
    consensusRows.find((c) => c.round === "interview") ??
    null;

  const panelRows = (await db.select().from(panels).where(eq(panels.positionId, positionId)));
  const members = panelRows.length
    ? (await db
        .select({ m: panelMembers, u: users })
        .from(panelMembers)
        .innerJoin(users, eq(users.id, panelMembers.userId))
        .where(inArray(panelMembers.panelId, panelRows.map((p) => p.id)))
        )
    : [];
  const coi = panelRows.length ? (await db.select().from(conflicts).where(inArray(conflicts.panelId, panelRows.map((p) => p.id)))) : [];

  const counts = {
    received: apps.length,
    eligible: apps.filter((r) => isEligible(r.a)).length,
    screenedOut: apps.filter((r) => r.a.listStatus === "not_shortlisted").length,
    reviewed: new Set(reviews.filter((r) => r.submittedAt).map((r) => r.applicationId)).size,
    longList: apps.filter((r) => r.a.listStatus === "long").length,
    shortlisted: apps.filter((r) => r.a.listStatus === "short").length,
    reserve: apps.filter((r) => r.a.listStatus === "reserve").length,
    interviewed: new Set(evals.filter((e) => e.status === "submitted" && e.round === "interview").map((e) => e.applicationId)).size,
    bySource: {
      direct: apps.filter((r) => r.a.source === "direct").length,
      agency: apps.filter((r) => r.a.source === "agency").length,
      referral: apps.filter((r) => r.a.source === "referral").length,
    },
  };

  const candidates: CandidateRow[] = apps
    .filter((r) => ["short", "reserve"].includes(r.a.listStatus) || evals.some((e) => e.applicationId === r.a.id))
    .map((r) => {
      const myReviews = reviews.filter((x) => x.applicationId === r.a.id && x.submittedAt);
      const shortlistScores = myReviews.map((x) => weightedScore(x.scores, rubric.shortlisting)).filter((n): n is number => n !== null);
      const rounds: CandidateRow["rounds"] = {};
      for (const round of ["interview", "talk", "second_round"] as PanelRound[]) {
        const es = evals.filter((e) => e.applicationId === r.a.id && e.round === round && e.status === "submitted");
        if (!es.length) continue;
        const vals = es.map((e) => weightedScore(e.scores, rubric[round])).filter((n): n is number => n !== null);
        rounds[round] = { avg: average(vals), count: es.length, recommendations: es.map((e) => e.recommendation).filter(Boolean) };
      }
      const roundAvgs = Object.values(rounds)
        .map((x) => x?.avg)
        .filter((n): n is number => typeof n === "number");
      const rankIndex = finalConsensus?.ranking.indexOf(r.a.id) ?? -1;
      return {
        applicationId: r.a.id,
        appNo: r.a.appNo ?? "",
        name: r.name,
        status: r.a.status,
        listStatus: r.a.listStatus,
        shortlistScore: average(shortlistScores),
        rounds,
        overall: average(roundAvgs),
        consensusRank: rankIndex >= 0 ? rankIndex + 1 : null,
        decision: decisions.find((d) => d.applicationId === r.a.id) ?? null,
        offer: offerRows.find((o) => o.applicationId === r.a.id) ?? null,
      };
    })
    .sort((a, b) => (a.consensusRank ?? 999) - (b.consensusRank ?? 999) || (b.overall ?? -1) - (a.overall ?? -1));

  const chair = finalConsensus?.chairId ? (await db.select().from(users).where(eq(users.id, finalConsensus.chairId)))[0] : null;
  const minutesDocs = (await db
    .select()
    .from(documents)
    .where(and(eq(documents.positionId, positionId), inArray(documents.kind, ["minutes", "board_attachment"])))
    );

  return {
    position,
    board,
    advert,
    runs,
    rubric,
    torPosition: (await getDoc(positionId, "tor_position"))?.body ?? "",
    torCommittee: (await getDoc(positionId, "tor_committee"))?.body ?? "",
    counts,
    panels: panelRows.map((p) => ({
      panel: p,
      members: members.filter((m) => m.m.panelId === p.id),
      conflicts: coi.filter((c) => c.panelId === p.id && c.hasConflict),
    })),
    candidates,
    consensus: finalConsensus,
    chair,
    minutesDocs,
  };
}

export type BoardPack = NonNullable<Awaited<ReturnType<typeof getBoardPack>>>;
