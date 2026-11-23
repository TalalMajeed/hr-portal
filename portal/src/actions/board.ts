"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, boardDecisions, boards, emailTemplates, emails, offers, positions, users } from "@/lib/db/schema";
import { assertUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { audit } from "@/lib/audit";
import { renderTemplate, sendEmail, sendTemplate } from "@/lib/email";
import { getPosition, setStage } from "@/lib/positions";
import { setApplicationStatus } from "@/lib/applications";
import { isFile, saveUpload } from "@/lib/uploads";
import { appUrl } from "@/lib/email";
import { done, fail, num, safe, str, type ActionState } from "@/lib/action-state";

async function ctx(fd: FormData, roles: ("super_admin" | "hr" | "ed")[] = ["super_admin", "hr", "ed"]) {
  const user = await assertUser(roles);
  const p = getPosition(num(fd, "id"));
  if (!p || !canManagePosition(user, p)) throw new Error("Position not found.");
  return { user, p };
}

function ensureBoard(positionId: number) {
  const b = db.select().from(boards).where(eq(boards.positionId, positionId)).get();
  return b ?? db.insert(boards).values({ positionId }).returning().get();
}

function refresh(id: number) {
  revalidatePath(`/admin/positions/${id}`, "layout");
  revalidatePath("/board");
}

function appFor(positionId: number, applicationId: number) {
  const row = db
    .select({ a: applications, c: users })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(and(eq(applications.id, applicationId), eq(applications.positionId, positionId)))
    .get();
  if (!row) throw new Error("Application not found.");
  return row;
}

/** H1, H2: meeting date, proposed salary, terms and minutes. */
export async function saveBoardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await ctx(fd);
    const b = ensureBoard(p.id);
    db.update(boards)
      .set({
        meetingDate: str(fd, "meetingDate"),
        proposedSalary: str(fd, "proposedSalary"),
        terms: str(fd, "terms"),
        minutes: str(fd, "minutes"),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(boards.id, b.id))
      .run();
    const file = fd.get("minutesFile");
    if (isFile(file)) {
      const r = await saveUpload(file, { kind: "minutes", positionId: p.id, uploadedBy: user.id, label: "Board minutes" });
      if (!r.ok) return fail(r.error);
    }
    audit(user.id, "board_saved", "position", p.id);
    refresh(p.id);
    return done("Board details saved.");
  });
}

/** H1: generates the pack, moves the position to stage 10 and tells the Board members. */
export async function generatePackAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await ctx(fd, ["super_admin", "hr"]);
    const b = ensureBoard(p.id);
    const now = new Date().toISOString();
    db.update(boards).set({ packGeneratedAt: now, updatedAt: now }).where(eq(boards.id, b.id)).run();
    setStage(p.id, 10, user.id, "Selection Board pack generated");
    for (const m of db.select().from(users).where(eq(users.role, "board")).all()) {
      if (!m.active) continue;
      sendEmail(
        { email: m.email, userId: m.id },
        `Selection Board pack: ${p.title}`,
        `Dear ${m.name},\n\nThe Selection Board pack for ${p.code} ${p.title} is ready${b.meetingDate ? ` for the meeting on ${b.meetingDate}` : ""}.\n\nRead it here: ${appUrl(`/board/${p.id}`)}\n\nDU Human Resources`,
        { positionId: p.id },
      );
    }
    audit(user.id, "board_pack_generated", "position", p.id);
    refresh(p.id);
    return done("Pack generated and sent to the Selection Board members.");
  });
}

/** H2: the Board's decision on one candidate. */
export async function decisionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await ctx(fd);
    const { a } = appFor(p.id, num(fd, "applicationId"));
    const decision = str(fd, "decision") as "recommended" | "not_recommended" | "deferred";
    if (!["recommended", "not_recommended", "deferred"].includes(decision)) return fail("Choose a decision.");
    const rank = num(fd, "rank") || null;
    const notes = str(fd, "notes");
    const existing = db.select().from(boardDecisions).where(and(eq(boardDecisions.positionId, p.id), eq(boardDecisions.applicationId, a.id))).get();
    if (existing) {
      db.update(boardDecisions).set({ decision, rank, notes, userId: user.id }).where(eq(boardDecisions.id, existing.id)).run();
    } else {
      db.insert(boardDecisions).values({ positionId: p.id, applicationId: a.id, decision, rank, notes, userId: user.id }).run();
    }
    audit(user.id, "board_decision", "application", a.id, `${decision}${rank ? ` rank ${rank}` : ""}${notes ? `: ${notes}` : ""}`);
    refresh(p.id);
    return done("Decision recorded.");
  });
}

/** The ED signs off the Board's report. */
export async function edSignOffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await ctx(fd, ["super_admin", "ed"]);
    const b = ensureBoard(p.id);
    if (!b.packGeneratedAt) return fail("Generate the pack first.");
    if (!db.select().from(boardDecisions).where(eq(boardDecisions.positionId, p.id)).all().length) return fail("Record the Board's decisions first.");
    db.update(boards).set({ edSignedOffAt: new Date().toISOString() }).where(eq(boards.id, b.id)).run();
    audit(user.id, "board_signed_off", "position", p.id);
    refresh(p.id);
    return done("Signed off.");
  });
}

function defaultOfferBody(p: typeof positions.$inferSelect, salary: string, terms: string) {
  return `Position: ${p.title}, ${p.department}\nGrade: ${p.grade}\nSalary: ${salary || "as agreed"}\nReporting to: ${p.reportingLine || "as assigned"}\n\n${terms || "Other terms as per Daanish University service rules."}\n\nThis offer is valid for 14 days.`;
}

function issueOffer(userId: number, p: typeof positions.$inferSelect, applicationId: number, salary: string, body: string) {
  const { a, c } = appFor(p.id, applicationId);
  if (db.select().from(offers).where(eq(offers.applicationId, a.id)).get()) throw new Error(`${c.name} already has an offer.`);
  db.insert(offers).values({ applicationId: a.id, positionId: p.id, salary, body }).run();
  setApplicationStatus(a.id, "selected", userId, { notify: false });
  if (!c.email.endsWith("@placeholder.local")) {
    sendTemplate("offer", { email: c.email, userId: c.id }, { name: c.name, position: p.title, offer_body: body }, { applicationId: a.id, positionId: p.id });
  }
  audit(userId, "offer_sent", "application", a.id, salary);
  return c.name;
}

/** H3: an offer letter from the template. */
export async function sendOfferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await ctx(fd, ["super_admin", "hr"]);
    const b = ensureBoard(p.id);
    const salary = str(fd, "salary") || b.proposedSalary;
    const body = str(fd, "body") || defaultOfferBody(p, salary, b.terms);
    const name = issueOffer(user.id, p, num(fd, "applicationId"), salary, body);
    refresh(p.id);
    return done(`Offer sent to ${name}.`);
  });
}

/** H3: when an offer is declined, offer the post to the next recommended candidate. */
export async function offerNextAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await ctx(fd, ["super_admin", "hr"]);
    const b = ensureBoard(p.id);
    const taken = new Set(db.select().from(offers).where(eq(offers.positionId, p.id)).all().map((o) => o.applicationId));
    const next = db
      .select()
      .from(boardDecisions)
      .where(and(eq(boardDecisions.positionId, p.id), eq(boardDecisions.decision, "recommended")))
      .all()
      .filter((d) => !taken.has(d.applicationId))
      .sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99))[0];
    if (!next) return fail("There is no other recommended candidate. Record a Board decision for a reserve candidate first.");
    const name = issueOffer(user.id, p, next.applicationId, b.proposedSalary, defaultOfferBody(p, b.proposedSalary, b.terms));
    refresh(p.id);
    return done(`Offer sent to the next candidate, ${name}.`);
  });
}

export async function offerStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await ctx(fd, ["super_admin", "hr"]);
    const offer = db.select().from(offers).where(and(eq(offers.id, num(fd, "offerId")), eq(offers.positionId, p.id))).get();
    if (!offer) return fail("Offer not found.");
    const step = str(fd, "step");
    const now = new Date().toISOString();
    if (step === "joined") {
      if (offer.status !== "accepted") return fail("Only an accepted offer can be marked as joined.");
      db.update(offers).set({ joinedAt: str(fd, "joinedAt") || now.slice(0, 10) }).where(eq(offers.id, offer.id)).run();
      const filled = db.select().from(offers).where(eq(offers.positionId, p.id)).all().filter((o) => o.joinedAt || o.id === offer.id).length;
      if (filled >= p.posts) db.update(positions).set({ status: "filled", updatedAt: now }).where(eq(positions.id, p.id)).run();
    } else if (step === "accepted" || step === "declined") {
      db.update(offers).set({ status: step, respondedAt: now }).where(eq(offers.id, offer.id)).run();
      if (step === "declined") setApplicationStatus(offer.applicationId, "not_selected", user.id, { notify: false, note: "Declined the offer" });
    } else if (step === "withdrawn") {
      db.update(offers).set({ status: "withdrawn", respondedAt: now }).where(eq(offers.id, offer.id)).run();
    } else return fail("Unknown step.");
    audit(user.id, `offer_${step}`, "application", offer.applicationId);
    refresh(p.id);
    return done("Offer updated.");
  });
}

/** H4: regret emails in bulk, from the template, to everyone not selected who hasn't had one. */
export async function sendRegretsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await ctx(fd, ["super_admin", "hr"]);
    const ids = fd.getAll("applicationIds").map(Number).filter(Boolean);
    if (!ids.length) return fail("Select at least one candidate.");
    const includeReason = str(fd, "includeReason") === "on";
    const tpl = db.select().from(emailTemplates).where(eq(emailTemplates.key, "regret")).get();
    if (!tpl) return fail("The regret template is missing.");
    const rows = db
      .select({ a: applications, c: users })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.candidateId))
      .where(and(eq(applications.positionId, p.id), inArray(applications.id, ids)))
      .all();
    let sent = 0;
    for (const { a, c } of rows) {
      const already = db.select().from(emails).where(and(eq(emails.applicationId, a.id), eq(emails.templateKey, "regret"))).get();
      if (already) continue;
      setApplicationStatus(a.id, "not_selected", user.id, { notify: false, note: "Regret sent" });
      if (!c.email.endsWith("@placeholder.local")) {
        const reason = includeReason && a.shareRejectionReason && a.rejectionReason ? `Reason: ${a.rejectionReason}` : "";
        const vars = { name: c.name, position: p.title, reason, portal_url: appUrl() };
        sendEmail({ email: c.email, userId: c.id }, renderTemplate(tpl.subject, vars), renderTemplate(tpl.body, vars), {
          templateKey: "regret",
          applicationId: a.id,
          positionId: p.id,
        });
      }
      sent++;
    }
    audit(user.id, "regrets_sent", "position", p.id, `${sent} candidates`);
    refresh(p.id);
    return done(sent ? `Regret emails sent to ${sent} ${sent === 1 ? "candidate" : "candidates"}.` : "Everyone selected already had a regret email.");
  });
}
