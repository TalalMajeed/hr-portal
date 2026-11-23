"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { consensus, evaluations, events, positions, users, type PanelRound, type Recommendation } from "@/lib/db/schema";
import { assertUser, type SessionUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { audit } from "@/lib/audit";
import { sendEmail, sendTemplate } from "@/lib/email";
import { getDoc, setStage } from "@/lib/positions";
import { readScores } from "@/lib/scoring";
import { eventPanelists, panelLink } from "@/lib/scheduling";
import { chairFor, expectedEvaluations } from "@/lib/evaluations";
import { PANEL_ROUNDS, ROUND_LABELS, STAFF_ROLES } from "@/lib/constants";
import { done, fail, num, safe, str, type ActionState } from "@/lib/action-state";

const RECS: Recommendation[] = ["recommend", "recommend_with_reservation", "not_recommend"];

function refresh(positionId: number, eventId?: number) {
  revalidatePath(`/admin/positions/${positionId}/evaluations`);
  revalidatePath("/panel");
  if (eventId) revalidatePath(`/panel/evaluate/${eventId}`);
}

/** G1 to G3: a panel member saves or submits their evaluation. Submitting locks it (G4). */
export async function saveEvaluationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["panel"]);
    const e = (await db.select().from(events).where(eq(events.id, num(fd, "eventId"))))[0];
    if (!e) return fail("That session no longer exists.");
    if (!(await eventPanelists(e)).some((m) => m.user.id === user.id)) return fail("This evaluation isn't assigned to you.");
    if (["cancelled", "declined"].includes(e.status)) return fail("This session was cancelled.");
    const existing = (await db.select().from(evaluations).where(and(eq(evaluations.eventId, e.id), eq(evaluations.panelistId, user.id))))[0];
    if (existing?.status === "submitted") return fail("You've already submitted this evaluation. The ED can reopen it if needed.");

    const items = (await getDoc(e.positionId, "rubric"))?.[e.round] ?? [];
    const { scores, errors, complete } = readScores(fd, items);
    if (errors.length) return fail(errors.join(" "));
    const recommendation = str(fd, "recommendation") as Recommendation | "";
    const submit = str(fd, "intent") === "submit";
    if (submit && !complete) return fail("Score every criterion before you submit.");
    if (submit && !RECS.includes(recommendation as Recommendation)) return fail("Choose your recommendation before you submit.");
    const now = new Date().toISOString();
    const values = {
      scores,
      strengths: str(fd, "strengths").slice(0, 4000),
      concerns: str(fd, "concerns").slice(0, 4000),
      recommendation: RECS.includes(recommendation as Recommendation) ? (recommendation as Recommendation) : ("" as const),
      status: submit ? ("submitted" as const) : existing?.status === "reopened" ? ("reopened" as const) : ("draft" as const),
      submittedAt: submit ? now : null,
      updatedAt: now,
    };
    if (existing) await db.update(evaluations).set(values).where(eq(evaluations.id, existing.id));
    else await db.insert(evaluations).values({ ...values, eventId: e.id, applicationId: e.applicationId, panelistId: user.id, round: e.round });
    await audit(user.id, submit ? "evaluation_submitted" : "evaluation_saved", "application", e.applicationId, `${e.round}: ${JSON.stringify(scores)} ${values.recommendation}`);
    if (submit) {
      if (e.status !== "completed") await db.update(events).set({ status: "completed", updatedAt: now }).where(eq(events.id, e.id));
      await setStage(e.positionId, 9, user.id, "Evaluations started");
    }
    refresh(e.positionId, e.id);
    return done(submit ? "Evaluation submitted. Thank you." : "Draft saved. You can come back to it.");
  });
}

/** G4: the ED reopens a submitted evaluation, with a reason. */
export async function reopenEvaluationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["ed", "super_admin"]);
    const ev = (await db.select().from(evaluations).where(eq(evaluations.id, num(fd, "evaluationId"))))[0];
    if (!ev) return fail("That evaluation no longer exists.");
    const reason = str(fd, "reason");
    if (!reason) return fail("Give a reason for reopening.", { reason: "Required" });
    if (ev.status !== "submitted") return fail("Only submitted evaluations can be reopened.");
    const e = (await db.select().from(events).where(eq(events.id, ev.eventId)))[0]!;
    await db.update(evaluations).set({ status: "reopened", reopenReason: reason, submittedAt: null, updatedAt: new Date().toISOString() }).where(eq(evaluations.id, ev.id));
    await audit(user.id, "evaluation_reopened", "application", ev.applicationId, reason);
    const panelist = (await db.select().from(users).where(eq(users.id, ev.panelistId)))[0]!;
    const position = (await db.select().from(positions).where(eq(positions.id, e.positionId)))[0]!;
    await sendEmail(
      { email: panelist.email, userId: panelist.id },
      `Evaluation reopened: ${position.title}`,
      `Dear ${panelist.name},\n\nThe Executive Director has reopened your ${ROUND_LABELS[e.round].toLowerCase()} evaluation for ${position.title}.\n\nReason: ${reason}\n\nPlease review and submit it again: ${panelLink(panelist, `/panel/evaluate/${e.id}`)}\n\nDU Human Resources`,
      { applicationId: ev.applicationId, positionId: position.id },
    );
    refresh(e.positionId, e.id);
    return done(`Reopened. ${panelist.name} has been asked to resubmit.`);
  });
}

async function positionFor(user: SessionUser, positionId: number) {
  const p = (await db.select().from(positions).where(eq(positions.id, positionId)))[0];
  if (!p || !canManagePosition(user, p)) throw new Error("You can't manage this position.");
  return p;
}

/** G7: reminds every panel member who hasn't submitted. */
export async function sendEvaluationRemindersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(STAFF_ROLES);
    const position = await positionFor(user, num(fd, "positionId"));
    const missing = (await expectedEvaluations(position.id)).filter((r) => r.evaluation?.status !== "submitted" && new Date(r.event.startsAt).getTime() <= Date.now());
    if (!missing.length) return fail("Nobody is overdue. Reminders only go for sessions that have taken place.");
    for (const r of missing) {
      await sendTemplate(
        "evaluation_reminder",
        { email: r.panelist.email, userId: r.panelist.id },
        { name: r.panelist.name, candidate: r.candidate.name, round: ROUND_LABELS[r.event.round].toLowerCase(), position: position.title, link: panelLink(r.panelist, `/panel/evaluate/${r.event.id}`) },
        { applicationId: r.app.id, positionId: position.id },
      );
    }
    await audit(user.id, "evaluation_reminders_sent", "position", position.id, `${missing.length} reminders`);
    refresh(position.id);
    return done(`${missing.length} reminder${missing.length === 1 ? "" : "s"} sent.`);
  });
}

async function canEditConsensus(user: SessionUser, positionId: number, round: PanelRound) {
  const p = (await db.select().from(positions).where(eq(positions.id, positionId)))[0];
  if (!p) return false;
  if (STAFF_ROLES.includes(user.role) && canManagePosition(user, p)) return true;
  return (await chairFor(positionId, round))?.id === user.id;
}

/** G6: consensus note and ranked recommendation, saved by HR or the panel chair. */
export async function saveConsensusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser([...STAFF_ROLES, "panel"]);
    const positionId = num(fd, "positionId");
    const round = str(fd, "round") as PanelRound;
    if (!PANEL_ROUNDS.includes(round)) return fail("Unknown round.");
    if (!await canEditConsensus(user, positionId, round)) return fail("Only HR or the panel chair can record the consensus.");
    const existing = (await db.select().from(consensus).where(and(eq(consensus.positionId, positionId), eq(consensus.round, round))))[0];
    if (existing?.signedOffAt) return fail("The chair has signed this off. It can't be changed.");
    const ranks: { id: number; rank: number }[] = [];
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("rank_")) continue;
      const rank = Number(v);
      if (String(v).trim() && Number.isInteger(rank) && rank > 0) ranks.push({ id: Number(k.slice(5)), rank });
    }
    if (new Set(ranks.map((r) => r.rank)).size !== ranks.length) return fail("Give each candidate a different rank.");
    const ranking = ranks.sort((a, b) => a.rank - b.rank).map((r) => r.id);
    const note = str(fd, "note").slice(0, 6000);
    const now = new Date().toISOString();
    if (existing) await db.update(consensus).set({ note, ranking, updatedAt: now }).where(eq(consensus.id, existing.id));
    else await db.insert(consensus).values({ positionId, round, note, ranking, updatedAt: now });
    await audit(user.id, "consensus_saved", "position", positionId, `${round}: ${ranking.join(", ")}`);
    refresh(positionId);
    revalidatePath(`/admin/positions/${positionId}/board`);
    return done("Consensus saved. The panel chair signs it off.");
  });
}

/** G6: the panel chair signs off the consensus. */
export async function signOffConsensusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["panel"]);
    const positionId = num(fd, "positionId");
    const round = str(fd, "round") as PanelRound;
    if ((await chairFor(positionId, round))?.id !== user.id) return fail("Only the panel chair can sign off.");
    const row = (await db.select().from(consensus).where(and(eq(consensus.positionId, positionId), eq(consensus.round, round))))[0];
    if (!row || !row.ranking.length) return fail("Record the ranking before signing off.");
    if (row.signedOffAt) return fail("Already signed off.");
    await db.update(consensus).set({ chairId: user.id, signedOffAt: new Date().toISOString() }).where(eq(consensus.id, row.id));
    await audit(user.id, "consensus_signed_off", "position", positionId, round);
    refresh(positionId);
    revalidatePath(`/admin/positions/${positionId}/board`);
    return done("Signed off. The ranked recommendation goes to the Selection Board.");
  });
}
