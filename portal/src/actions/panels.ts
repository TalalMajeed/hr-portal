"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvals, conflicts, panelAvailability, panelMembers, panels, panelSlots, positions, users, type PanelRound } from "@/lib/db/schema";
import { assertUser, newToken, type SessionUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { audit } from "@/lib/audit";
import { appUrl, sendTemplate } from "@/lib/email";
import { setStage } from "@/lib/positions";
import { panelLink } from "@/lib/scheduling";
import { PANEL_ROUNDS, ROUND_LABELS, STAFF_ROLES } from "@/lib/constants";
import { pktInputToIso } from "@/lib/format";
import { bool, done, fail, num, safe, str, type ActionState } from "@/lib/action-state";

const MANAGERS = STAFF_ROLES;

function panelFor(user: SessionUser, panelId: number) {
  const panel = db.select().from(panels).where(eq(panels.id, panelId)).get();
  if (!panel) throw new Error("That panel no longer exists.");
  const position = db.select().from(positions).where(eq(positions.id, panel.positionId)).get()!;
  if (!canManagePosition(user, position)) throw new Error("You can't manage this position.");
  return { panel, position };
}

function refresh(positionId: number) {
  revalidatePath(`/admin/positions/${positionId}/panels`);
  revalidatePath(`/admin/positions/${positionId}/schedule`);
  revalidatePath("/panel");
}

/* ------------------------------------------------------------------ */
/* E1: panel member directory                                          */
/* ------------------------------------------------------------------ */

export async function savePanelistAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const id = num(fd, "id");
    const name = str(fd, "name");
    const email = str(fd, "email").toLowerCase();
    if (name.length < 2) return fail("Enter the panel member's name.", { name: "Required" });
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email address.", { email: "Enter a valid email" });
    const clash = db.select().from(users).where(eq(users.email, email)).get();
    if (clash && clash.id !== id) return fail("Someone else already uses that email.");
    const values = {
      name,
      email,
      phone: str(fd, "phone"),
      designation: str(fd, "designation"),
      organisation: str(fd, "organisation"),
      discipline: str(fd, "discipline"),
      external: bool(fd, "external"),
    };
    if (id) {
      const existing = db.select().from(users).where(and(eq(users.id, id), eq(users.role, "panel"))).get();
      if (!existing) return fail("That panel member no longer exists.");
      db.update(users).set({ ...values, accessToken: existing.accessToken ?? newToken() }).where(eq(users.id, id)).run();
      audit(user.id, "panelist_updated", "user", id, name);
      revalidatePath("/admin/panelists");
      return done(`${name} updated.`);
    }
    const row = db
      .insert(users)
      .values({ ...values, role: "panel", accessToken: newToken(), emailVerified: true })
      .returning()
      .get();
    audit(user.id, "panelist_added", "user", row.id, name);
    revalidatePath("/admin/panelists");
    return done(`${name} added to the directory.`);
  });
}

export async function regenerateLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const id = num(fd, "id");
    const target = db.select().from(users).where(eq(users.id, id)).get();
    if (!target || !["panel", "reviewer"].includes(target.role)) return fail("Links are only for panel members and reviewers.");
    db.update(users).set({ accessToken: newToken() }).where(eq(users.id, id)).run();
    audit(user.id, "secure_link_replaced", "user", id, target.name);
    revalidatePath("/admin/panelists");
    return done("New link created. The old one no longer works.");
  });
}

/* ------------------------------------------------------------------ */
/* E2, E3, E6: building a panel                                        */
/* ------------------------------------------------------------------ */

export async function createPanelAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const positionId = num(fd, "positionId");
    const position = db.select().from(positions).where(eq(positions.id, positionId)).get();
    if (!position || !canManagePosition(user, position)) return fail("You can't manage this position.");
    const round = str(fd, "round") as PanelRound;
    if (!PANEL_ROUNDS.includes(round)) return fail("Choose a round.");
    if (db.select().from(panels).where(and(eq(panels.positionId, positionId), eq(panels.round, round))).get()) {
      return fail(`There is already a ${ROUND_LABELS[round].toLowerCase()} panel for this position.`);
    }
    const panel = db
      .insert(panels)
      .values({ positionId, round, name: str(fd, "name") || `${ROUND_LABELS[round]} panel` })
      .returning()
      .get();
    audit(user.id, "panel_created", "panel", panel.id, `${position.code} ${round}`);
    setStage(positionId, 6, user.id, "Interview panel formed");
    refresh(positionId);
    return done(`${ROUND_LABELS[round]} panel created. Add its members next.`);
  });
}

export async function addMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { panel, position } = panelFor(user, num(fd, "panelId"));
    const member = db.select().from(users).where(and(eq(users.id, num(fd, "userId")), eq(users.role, "panel"))).get();
    if (!member) return fail("Choose someone from the panel directory.");
    if (db.select().from(panelMembers).where(and(eq(panelMembers.panelId, panel.id), eq(panelMembers.userId, member.id))).get()) {
      return fail(`${member.name} is already on this panel.`);
    }
    const hasChair = !!db.select().from(panelMembers).where(and(eq(panelMembers.panelId, panel.id), eq(panelMembers.isChair, true))).get();
    db.insert(panelMembers).values({ panelId: panel.id, userId: member.id, isChair: bool(fd, "isChair") || !hasChair }).run();
    if (bool(fd, "isChair") && hasChair) {
      db.update(panelMembers).set({ isChair: false }).where(and(eq(panelMembers.panelId, panel.id), ne(panelMembers.userId, member.id))).run();
    }
    audit(user.id, "panel_member_added", "panel", panel.id, member.name);
    refresh(position.id);
    return done(`${member.name} added.`);
  });
}

export async function setChairAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const m = db.select().from(panelMembers).where(eq(panelMembers.id, num(fd, "memberId"))).get();
    if (!m) return fail("That member is no longer on the panel.");
    const { panel, position } = panelFor(user, m.panelId);
    db.update(panelMembers).set({ isChair: false }).where(eq(panelMembers.panelId, panel.id)).run();
    db.update(panelMembers).set({ isChair: true }).where(eq(panelMembers.id, m.id)).run();
    audit(user.id, "panel_chair_set", "panel", panel.id, String(m.userId));
    refresh(position.id);
    return done("Chair updated.");
  });
}

export async function removeMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const m = db.select().from(panelMembers).where(eq(panelMembers.id, num(fd, "memberId"))).get();
    if (!m) return fail("That member is no longer on the panel.");
    const { panel, position } = panelFor(user, m.panelId);
    if (m.inviteStatus !== "not_sent") return fail("This member has been invited. Use Replace instead, so the change is logged.");
    const slotIds = db.select({ id: panelSlots.id }).from(panelSlots).where(eq(panelSlots.panelId, panel.id)).all().map((s) => s.id);
    if (slotIds.length) db.delete(panelAvailability).where(and(eq(panelAvailability.userId, m.userId), inArray(panelAvailability.slotId, slotIds))).run();
    db.delete(panelMembers).where(eq(panelMembers.id, m.id)).run();
    audit(user.id, "panel_member_removed", "panel", panel.id, String(m.userId));
    refresh(position.id);
    return done("Member removed.");
  });
}

function invite(panel: typeof panels.$inferSelect, position: typeof positions.$inferSelect, memberRowId: number) {
  const m = db
    .select({ member: panelMembers, user: users })
    .from(panelMembers)
    .innerJoin(users, eq(users.id, panelMembers.userId))
    .where(eq(panelMembers.id, memberRowId))
    .get()!;
  const portal = panelLink(m.user, `/panel/panels/${panel.id}`);
  sendTemplate(
    "panel_invite",
    { email: m.user.email, userId: m.user.id },
    { name: m.user.name, round: ROUND_LABELS[panel.round].toLowerCase(), position: position.title, link: portal },
    {
      positionId: position.id,
      attachments: [
        { name: "Terms of reference", url: appUrl(`/panel/panels/${panel.id}#tors`) },
        { name: "Evaluation rubric", url: appUrl(`/panel/panels/${panel.id}#rubric`) },
        { name: "Candidate files", url: appUrl(`/panel/panels/${panel.id}#candidates`) },
      ],
    },
  );
  db.update(panelMembers).set({ inviteStatus: "pending", invitedAt: new Date().toISOString() }).where(eq(panelMembers.id, memberRowId)).run();
}

/** E3: emails everyone not yet invited, with the ToRs, rubric and candidate files. */
export async function sendInvitesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { panel, position } = panelFor(user, num(fd, "panelId"));
    const pending = db
      .select()
      .from(panelMembers)
      .where(and(eq(panelMembers.panelId, panel.id), eq(panelMembers.inviteStatus, "not_sent")))
      .all();
    if (!pending.length) return fail("Everyone on this panel has already been invited.");
    for (const m of pending) invite(panel, position, m.id);
    audit(user.id, "panel_invites_sent", "panel", panel.id, `${pending.length} invitations`);
    refresh(position.id);
    return done(`${pending.length} invitation${pending.length === 1 ? "" : "s"} sent.`);
  });
}

/** E6: replaces a member who declined, keeping a log of who replaced whom and why. */
export async function replaceMemberAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const old = db.select().from(panelMembers).where(eq(panelMembers.id, num(fd, "memberId"))).get();
    if (!old) return fail("That member is no longer on the panel.");
    const { panel, position } = panelFor(user, old.panelId);
    const reason = str(fd, "reason");
    if (!reason) return fail("Give a reason for the replacement.", { reason: "Required" });
    const replacement = db.select().from(users).where(and(eq(users.id, num(fd, "userId")), eq(users.role, "panel"))).get();
    if (!replacement) return fail("Choose the replacement from the directory.");
    if (db.select().from(panelMembers).where(and(eq(panelMembers.panelId, panel.id), eq(panelMembers.userId, replacement.id))).get()) {
      return fail(`${replacement.name} is already on this panel.`);
    }
    const row = db.insert(panelMembers).values({ panelId: panel.id, userId: replacement.id, isChair: old.isChair }).returning().get();
    db.update(panelMembers).set({ inviteStatus: "replaced", isChair: false, replacedById: row.id, replaceReason: reason }).where(eq(panelMembers.id, old.id)).run();
    invite(panel, position, row.id);
    audit(user.id, "panel_member_replaced", "panel", panel.id, `${old.userId} replaced by ${replacement.name}: ${reason}`);
    refresh(position.id);
    return done(`${replacement.name} added and invited.`);
  });
}

/** ED approval of a panel: draft, pending approval, approved. */
export async function panelApprovalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { panel, position } = panelFor(user, num(fd, "panelId"));
    const intent = str(fd, "intent");
    const comment = str(fd, "comment");
    if (intent === "submit") {
      const count = db.select().from(panelMembers).where(and(eq(panelMembers.panelId, panel.id), ne(panelMembers.inviteStatus, "replaced"))).all().length;
      if (count < 2) return fail("A panel needs at least two members before it goes to the ED.");
      db.update(panels).set({ status: "pending_approval" }).where(eq(panels.id, panel.id)).run();
      db.insert(approvals).values({ positionId: position.id, subject: "panel", action: "submitted", comment: comment || `${ROUND_LABELS[panel.round]} panel`, userId: user.id }).run();
      audit(user.id, "panel_submitted", "panel", panel.id);
      refresh(position.id);
      revalidatePath("/admin/approvals");
      return done("Panel sent to the ED for approval.");
    }
    if (!["ed", "super_admin"].includes(user.role)) return fail("Only the Executive Director can approve a panel.");
    if (panel.status !== "pending_approval") return fail("This panel isn't waiting for approval.");
    if (intent === "approve") {
      db.update(panels).set({ status: "approved" }).where(eq(panels.id, panel.id)).run();
      db.insert(approvals).values({ positionId: position.id, subject: "panel", action: "ed_approved", comment: comment || `${ROUND_LABELS[panel.round]} panel approved.`, userId: user.id }).run();
      audit(user.id, "panel_approved", "panel", panel.id);
      refresh(position.id);
      revalidatePath("/admin/approvals");
      return done("Panel approved.");
    }
    if (intent === "return") {
      if (!comment) return fail("Say what needs to change.", { comment: "Required" });
      db.update(panels).set({ status: "draft" }).where(eq(panels.id, panel.id)).run();
      db.insert(approvals).values({ positionId: position.id, subject: "panel", action: "returned", comment, userId: user.id }).run();
      audit(user.id, "panel_returned", "panel", panel.id, comment);
      refresh(position.id);
      revalidatePath("/admin/approvals");
      return done("Panel returned to HR.");
    }
    return fail("Unknown action.");
  });
}

/* ------------------------------------------------------------------ */
/* E4: availability poll slots                                         */
/* ------------------------------------------------------------------ */

export async function addSlotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { panel, position } = panelFor(user, num(fd, "panelId"));
    const startsAt = pktInputToIso(str(fd, "startsAt"));
    if (!startsAt) return fail("Choose a date and time.");
    if (new Date(startsAt).getTime() < Date.now()) return fail("Choose a time in the future.");
    const durationMin = Math.min(240, Math.max(15, num(fd, "durationMin", 45)));
    db.insert(panelSlots).values({ panelId: panel.id, startsAt, durationMin }).run();
    audit(user.id, "slot_added", "panel", panel.id, startsAt);
    refresh(position.id);
    return done("Slot added to the availability poll.");
  });
}

export async function deleteSlotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const slot = db.select().from(panelSlots).where(eq(panelSlots.id, num(fd, "slotId"))).get();
    if (!slot) return fail("That slot is already gone.");
    const { panel, position } = panelFor(user, slot.panelId);
    db.delete(panelAvailability).where(eq(panelAvailability.slotId, slot.id)).run();
    db.delete(panelSlots).where(eq(panelSlots.id, slot.id)).run();
    audit(user.id, "slot_removed", "panel", panel.id, slot.startsAt);
    refresh(position.id);
    return done("Slot removed.");
  });
}

/* ------------------------------------------------------------------ */
/* Panel member side                                                   */
/* ------------------------------------------------------------------ */

function myMembership(user: SessionUser, panelId: number) {
  const m = db
    .select()
    .from(panelMembers)
    .where(and(eq(panelMembers.panelId, panelId), eq(panelMembers.userId, user.id), ne(panelMembers.inviteStatus, "replaced")))
    .orderBy(desc(panelMembers.id))
    .get();
  if (!m) throw new Error("You aren't on this panel.");
  return m;
}

/** E4: accept or decline the invitation. */
export async function respondInviteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["panel"]);
    const m = myMembership(user, num(fd, "panelId"));
    const response = str(fd, "response");
    const reason = str(fd, "reason");
    if (response !== "accept" && response !== "decline") return fail("Choose accept or decline.");
    if (response === "decline" && !reason) return fail("Tell HR briefly why, so they can find a replacement.", { reason: "Required" });
    db.update(panelMembers)
      .set({ inviteStatus: response === "accept" ? "accepted" : "declined", respondedAt: new Date().toISOString(), declineReason: response === "decline" ? reason : "" })
      .where(eq(panelMembers.id, m.id))
      .run();
    audit(user.id, response === "accept" ? "panel_invite_accepted" : "panel_invite_declined", "panel", m.panelId, reason);
    const panel = db.select().from(panels).where(eq(panels.id, m.panelId)).get()!;
    refresh(panel.positionId);
    revalidatePath(`/panel/panels/${m.panelId}`);
    return done(response === "accept" ? "Thank you. Now mark the slots you can attend." : "Thank you for letting us know.");
  });
}

/** E4: the built-in availability poll. Ticked slots are available, the rest are not. */
export async function saveAvailabilityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["panel"]);
    const panelId = num(fd, "panelId");
    const m = myMembership(user, panelId);
    if (m.inviteStatus !== "accepted") return fail("Accept the invitation first.");
    const slots = db.select().from(panelSlots).where(eq(panelSlots.panelId, panelId)).all();
    const ticked = new Set(fd.getAll("slotIds").map(Number));
    for (const s of slots) {
      const available = ticked.has(s.id);
      const existing = db.select().from(panelAvailability).where(and(eq(panelAvailability.slotId, s.id), eq(panelAvailability.userId, user.id))).get();
      if (existing) db.update(panelAvailability).set({ available }).where(eq(panelAvailability.id, existing.id)).run();
      else db.insert(panelAvailability).values({ slotId: s.id, userId: user.id, available }).run();
    }
    audit(user.id, "availability_saved", "panel", panelId, `${ticked.size} of ${slots.length} slots`);
    const panel = db.select().from(panels).where(eq(panels.id, panelId)).get()!;
    refresh(panel.positionId);
    revalidatePath(`/panel/panels/${panelId}`);
    return done("Availability saved.");
  });
}

/** E5: conflict-of-interest declaration for one candidate. */
export async function declareConflictAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["panel"]);
    const panelId = num(fd, "panelId");
    const m = myMembership(user, panelId);
    if (m.inviteStatus !== "accepted") return fail("Accept the invitation first.");
    const applicationId = num(fd, "applicationId");
    const value = str(fd, "conflict");
    if (value !== "yes" && value !== "no") return fail("Choose whether you have a conflict.");
    const note = str(fd, "note");
    if (value === "yes" && !note) return fail("Describe the conflict briefly.", { note: "Required" });
    const existing = db.select().from(conflicts).where(and(eq(conflicts.panelId, panelId), eq(conflicts.userId, user.id), eq(conflicts.applicationId, applicationId))).get();
    if (existing) db.update(conflicts).set({ hasConflict: value === "yes", note }).where(eq(conflicts.id, existing.id)).run();
    else db.insert(conflicts).values({ panelId, userId: user.id, applicationId, hasConflict: value === "yes", note }).run();
    audit(user.id, value === "yes" ? "conflict_declared" : "no_conflict_declared", "application", applicationId, note);
    const panel = db.select().from(panels).where(eq(panels.id, panelId)).get()!;
    refresh(panel.positionId);
    revalidatePath(`/panel/panels/${panelId}`);
    return done(value === "yes" ? "Conflict recorded. You won't see or score this candidate." : "Declaration saved.");
  });
}
