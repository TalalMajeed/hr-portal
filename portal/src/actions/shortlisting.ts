"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applicationNotes,
  applications,
  approvals,
  documentRequests,
  positions,
  reviewAssignments,
  users,
  type ApplicationStatus,
  type DocumentKind,
  type ListStatus,
} from "@/lib/db/schema";
import { assertUser, newToken, type SessionUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { audit } from "@/lib/audit";
import { appUrl, sendTemplate } from "@/lib/email";
import { setApplicationStatus } from "@/lib/applications";
import { setStage } from "@/lib/positions";
import { isFile, saveUpload } from "@/lib/uploads";
import { APPLICATION_STATUS, LIST_STATUS, STAFF_ROLES } from "@/lib/constants";
import { bool, done, fail, num, safe, str, type ActionState } from "@/lib/action-state";

const MANAGERS = STAFF_ROLES;
const APPROVERS = ["ed", "super_admin"] as const;

function positionFor(user: SessionUser, positionId: number) {
  const p = db.select().from(positions).where(eq(positions.id, positionId)).get();
  if (!p || !canManagePosition(user, p)) throw new Error("You can't manage this position.");
  return p;
}

function appFor(user: SessionUser, applicationId: number) {
  const app = db.select().from(applications).where(eq(applications.id, applicationId)).get();
  if (!app) throw new Error("That application no longer exists.");
  const position = positionFor(user, app.positionId);
  return { app, position };
}

function refresh(positionId: number, applicationId?: number) {
  revalidatePath(`/admin/positions/${positionId}/applications`);
  if (applicationId) revalidatePath(`/admin/applications/${applicationId}`);
}

/** Candidates who applied and haven't been looked at yet move to "Under review". */
function markUnderReview(applicationId: number, userId: number) {
  const a = db.select({ status: applications.status }).from(applications).where(eq(applications.id, applicationId)).get();
  if (a?.status === "applied") setApplicationStatus(applicationId, "under_review", userId);
}

const LIST_VALUES: ListStatus[] = ["pending", "long", "short", "reserve", "not_shortlisted"];

function moveToList(ids: number[], to: ListStatus, reason: string, user: SessionUser) {
  for (const id of ids) {
    db.update(applications).set({ listStatus: to, listReason: reason, updatedAt: new Date().toISOString() }).where(eq(applications.id, id)).run();
    audit(user.id, "list_changed", "application", id, `${LIST_STATUS[to].label}${reason ? `: ${reason}` : ""}`);
    if (to !== "pending") markUnderReview(id, user.id);
  }
}

function assign(ids: number[], reviewerIds: number[], positionId: number, user: SessionUser) {
  const position = db.select().from(positions).where(eq(positions.id, positionId)).get()!;
  const reviewers = db.select().from(users).where(and(inArray(users.id, reviewerIds), eq(users.role, "reviewer"))).all();
  if (!reviewers.length) throw new Error("Choose at least one reviewer.");
  let created = 0;
  for (const r of reviewers) {
    let mine = 0;
    for (const id of ids) {
      const exists = db.select().from(reviewAssignments).where(and(eq(reviewAssignments.applicationId, id), eq(reviewAssignments.reviewerId, r.id))).get();
      if (exists) continue;
      db.insert(reviewAssignments).values({ applicationId: id, reviewerId: r.id, assignedBy: user.id }).run();
      audit(user.id, "reviewer_assigned", "application", id, r.name);
      markUnderReview(id, user.id);
      mine += 1;
    }
    created += mine;
    if (mine > 0) {
      const link = r.external && r.accessToken ? appUrl(`/x/${r.accessToken}`) : appUrl("/review");
      sendTemplate("reviewer_invite", { email: r.email, userId: r.id }, { name: r.name, position: position.title, count: mine, link }, { positionId });
    }
  }
  return created;
}

/** D3 and D5: bulk list moves and reviewer assignment from the applications table. */
export async function bulkApplicationsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const positionId = num(fd, "positionId");
    positionFor(user, positionId);
    const ids = fd
      .getAll("ids")
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0);
    if (!ids.length) return fail("Tick at least one application first.");
    const owned = db.select({ id: applications.id }).from(applications).where(and(inArray(applications.id, ids), eq(applications.positionId, positionId))).all().map((a) => a.id);
    const intent = str(fd, "intent");
    if (intent === "assign") {
      const reviewerIds = fd.getAll("reviewerIds").map(Number);
      const n = assign(owned, reviewerIds, positionId, user);
      setStage(positionId, 5, user.id, "Shortlisting started");
      refresh(positionId);
      return done(n ? `${n} review${n === 1 ? "" : "s"} assigned. Reviewers have been emailed.` : "Those reviewers already had these applications.");
    }
    const to = str(fd, "listStatus") as ListStatus;
    if (!LIST_VALUES.includes(to)) return fail("Choose where to move the applications.");
    const reason = str(fd, "reason");
    if (to === "not_shortlisted" && !reason) return fail("Give a reason for not shortlisting.", { reason: "Required" });
    moveToList(owned, to, reason, user);
    setStage(positionId, 5, user.id, "Shortlisting started");
    refresh(positionId);
    return done(`${owned.length} application${owned.length === 1 ? "" : "s"} moved to ${LIST_STATUS[to].label.toLowerCase()}.`);
  });
}

/** Adds a shortlisting reviewer. External reviewers get a secure link instead of a password. */
export async function addReviewerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const name = str(fd, "name");
    const email = str(fd, "email").toLowerCase();
    if (name.length < 2) return fail("Enter the reviewer's name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return fail("Enter a valid email address.");
    if (db.select().from(users).where(eq(users.email, email)).get()) return fail("Someone already uses that email. Pick them from the list instead.");
    const external = bool(fd, "external");
    const row = db
      .insert(users)
      .values({
        name,
        email,
        role: "reviewer",
        organisation: str(fd, "organisation"),
        designation: str(fd, "designation"),
        discipline: str(fd, "discipline"),
        external,
        accessToken: newToken(),
        emailVerified: true,
      })
      .returning()
      .get();
    audit(user.id, "reviewer_added", "user", row.id, `${name}${external ? " (external)" : ""}`);
    revalidatePath(`/admin/positions/${num(fd, "positionId")}/applications`);
    return done(`${name} added. Tick their name when you assign applications.`);
  });
}

function latestShortlistAction(positionId: number) {
  return db
    .select()
    .from(approvals)
    .where(and(eq(approvals.positionId, positionId), eq(approvals.subject, "shortlist")))
    .orderBy(desc(approvals.id))
    .get();
}

/** D7: HR sends the shortlist to the ED; the ED approves or returns it. */
export async function shortlistApprovalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const positionId = num(fd, "positionId");
    const position = positionFor(user, positionId);
    const intent = str(fd, "intent");
    const comment = str(fd, "comment");
    const shortIds = db
      .select({ id: applications.id })
      .from(applications)
      .where(and(eq(applications.positionId, positionId), eq(applications.listStatus, "short")))
      .all()
      .map((a) => a.id);

    if (intent === "submit") {
      if (!shortIds.length) return fail("Move at least one application to the shortlist first.");
      if (latestShortlistAction(positionId)?.action === "submitted") return fail("The shortlist is already with the ED.");
      db.insert(approvals).values({ positionId, subject: "shortlist", action: "submitted", comment, userId: user.id }).run();
      db.update(positions).set({ shortlistApproved: false }).where(eq(positions.id, positionId)).run();
      audit(user.id, "shortlist_submitted", "position", positionId, `${shortIds.length} shortlisted`);
      refresh(positionId);
      revalidatePath("/admin/approvals");
      return done("Shortlist sent to the ED for approval.");
    }

    if (!APPROVERS.includes(user.role as (typeof APPROVERS)[number])) return fail("Only the Executive Director can approve a shortlist.");
    if (latestShortlistAction(positionId)?.action !== "submitted") return fail("There is no shortlist waiting for approval.");

    if (intent === "return") {
      if (!comment) return fail("Say what needs to change before returning it.", { comment: "Required" });
      db.insert(approvals).values({ positionId, subject: "shortlist", action: "returned", comment, userId: user.id }).run();
      audit(user.id, "shortlist_returned", "position", positionId, comment);
      refresh(positionId);
      revalidatePath("/admin/approvals");
      return done("Shortlist returned to HR with your comment.");
    }

    if (intent === "approve") {
      db.insert(approvals).values({ positionId, subject: "shortlist", action: "ed_approved", comment: comment || "Approved.", userId: user.id }).run();
      db.update(positions).set({ shortlistApproved: true, updatedAt: new Date().toISOString() }).where(eq(positions.id, positionId)).run();
      audit(user.id, "shortlist_approved", "position", positionId, `${shortIds.length} shortlisted`);
      for (const id of shortIds) {
        setApplicationStatus(id, "shortlisted", user.id, { message: "The panel will contact you about the interview." });
      }
      // Not shortlisted: marked now; regret emails go out in bulk from the Selection Board page (H4).
      const rest = db
        .select({ id: applications.id, status: applications.status })
        .from(applications)
        .where(and(eq(applications.positionId, positionId), eq(applications.listStatus, "not_shortlisted")))
        .all();
      for (const a of rest) {
        if (!["not_selected", "withdrawn"].includes(a.status)) setApplicationStatus(a.id, "not_selected", user.id, { notify: false, note: "Not shortlisted. Regret email pending." });
      }
      refresh(positionId);
      revalidatePath("/admin/approvals");
      return done(`Shortlist approved. ${shortIds.length} candidate${shortIds.length === 1 ? " has" : "s have"} been told they are shortlisted for ${position.title}.`);
    }
    return fail("Unknown action.");
  });
}

/** D2: HR overrides the automatic eligibility result, with a reason. */
export async function overrideEligibilityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { app, position } = appFor(user, num(fd, "applicationId"));
    const value = str(fd, "value");
    const reason = str(fd, "reason");
    if (value === "clear") {
      db.update(applications).set({ eligibilityOverride: null, overrideReason: "" }).where(eq(applications.id, app.id)).run();
      audit(user.id, "eligibility_override_cleared", "application", app.id);
      refresh(position.id, app.id);
      return done("Override removed. The automatic result applies again.");
    }
    if (value !== "met" && value !== "not_met") return fail("Choose met or not met.");
    if (!reason) return fail("Give a reason for the override.", { reason: "Required" });
    db.update(applications).set({ eligibilityOverride: value, overrideReason: reason }).where(eq(applications.id, app.id)).run();
    audit(user.id, "eligibility_overridden", "application", app.id, `${value}: ${reason}`);
    refresh(position.id, app.id);
    return done("Override saved.");
  });
}

/** D6: internal remarks, never shown to the candidate. */
export async function addNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { app, position } = appFor(user, num(fd, "applicationId"));
    const body = str(fd, "body");
    if (!body) return fail("Write the remark first.");
    db.insert(applicationNotes).values({ applicationId: app.id, userId: user.id, body: body.slice(0, 4000) }).run();
    audit(user.id, "note_added", "application", app.id);
    refresh(position.id, app.id);
    return done("Remark added.");
  });
}

/** D6: rejection reason, and whether the candidate may see it. */
export async function setRejectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { app, position } = appFor(user, num(fd, "applicationId"));
    const reason = str(fd, "reason");
    const share = bool(fd, "share");
    db.update(applications).set({ rejectionReason: reason, shareRejectionReason: share && !!reason }).where(eq(applications.id, app.id)).run();
    audit(user.id, "rejection_reason_set", "application", app.id, `${share ? "shared" : "internal"}: ${reason}`);
    refresh(position.id, app.id);
    return done(share ? "Reason saved. The candidate will see it." : "Reason saved for HR only.");
  });
}

/** C9 (HR side): ask the candidate for a document after submission. */
export async function requestDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { app, position } = appFor(user, num(fd, "applicationId"));
    const label = str(fd, "label");
    if (label.length < 3) return fail("Say which document you need.");
    db.insert(documentRequests).values({ applicationId: app.id, label }).run();
    const cand = db.select().from(users).where(eq(users.id, app.candidateId)).get()!;
    if (!cand.email.endsWith("@placeholder.local")) {
      sendTemplate("document_request", { email: cand.email, userId: cand.id }, { name: cand.name, position: position.title, app_no: app.appNo, document: label }, { applicationId: app.id, positionId: position.id });
    }
    audit(user.id, "document_requested", "application", app.id, label);
    refresh(position.id, app.id);
    return done(`Request sent to ${cand.name}.`);
  });
}

/** C10: one application's status, with an email to the candidate unless turned off. */
export async function changeStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { app, position } = appFor(user, num(fd, "applicationId"));
    const to = str(fd, "status") as ApplicationStatus;
    if (!(to in APPLICATION_STATUS) || to === "draft") return fail("Choose a status.");
    if (to === app.status) return fail("The application already has that status.");
    setApplicationStatus(app.id, to, user.id, { note: str(fd, "note"), notify: bool(fd, "notify"), message: str(fd, "note") });
    refresh(position.id, app.id);
    return done(`Status changed to ${APPLICATION_STATUS[to].label}.`);
  });
}

/** D5 for a single application. */
export async function setListStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { app, position } = appFor(user, num(fd, "applicationId"));
    const to = str(fd, "listStatus") as ListStatus;
    if (!LIST_VALUES.includes(to)) return fail("Choose a list.");
    const reason = str(fd, "reason");
    if (to === "not_shortlisted" && !reason) return fail("Give a reason for not shortlisting.");
    moveToList([app.id], to, reason, user);
    setStage(position.id, 5, user.id, "Shortlisting started");
    refresh(position.id, app.id);
    return done(`Moved to ${LIST_STATUS[to].label.toLowerCase()}.`);
  });
}

/** D3 for a single application. */
export async function assignReviewerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { app, position } = appFor(user, num(fd, "applicationId"));
    const n = assign([app.id], [num(fd, "reviewerId")], position.id, user);
    setStage(position.id, 5, user.id, "Shortlisting started");
    refresh(position.id, app.id);
    return n ? done("Reviewer assigned and emailed.") : fail("That reviewer already has this application.");
  });
}

const SUPPORTING_KINDS: DocumentKind[] = ["slides", "reference_check", "verification", "other"];

/** G8: presentation slides, reference checks and document verification on an application. */
export async function uploadSupportingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { app, position } = appFor(user, num(fd, "applicationId"));
    const kind = str(fd, "kind") as DocumentKind;
    if (!SUPPORTING_KINDS.includes(kind)) return fail("Choose what kind of file this is.");
    const file = fd.get("file");
    if (!isFile(file)) return fail("Choose a file to upload.");
    const res = await saveUpload(file, { kind, applicationId: app.id, positionId: position.id, label: str(fd, "label"), uploadedBy: user.id });
    if (!res.ok) return fail(res.error);
    refresh(position.id, app.id);
    return done("File attached.");
  });
}
