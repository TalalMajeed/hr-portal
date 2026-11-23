"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, advertRuns, applications, approvals, positions, users, type AdvertQuestion, type AdvertUpload, type Role } from "@/lib/db/schema";
import { assertUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { audit } from "@/lib/audit";
import { appUrl, sendEmail, sendTemplate } from "@/lib/email";
import { generateAdvertBody } from "@/lib/adverts";
import { getDoc, getPosition, logPositionEvent, setStage } from "@/lib/positions";
import { formatDateTime, pktInputToIso } from "@/lib/format";
import { done, fail, num, safe, str, type ActionState } from "@/lib/action-state";

async function context(fd: FormData, roles: Role[] = ["super_admin", "hr", "ed", "hiring_lead"]) {
  const user = await assertUser(roles);
  const p = getPosition(num(fd, "id"));
  if (!p || !canManagePosition(user, p)) throw new Error("Position not found.");
  const ad = db.select().from(adverts).where(eq(adverts.positionId, p.id)).get() ?? null;
  return { user, p, ad };
}

function refresh(id: number) {
  revalidatePath(`/admin/positions/${id}`, "layout");
  revalidatePath("/careers");
  revalidatePath("/");
  revalidatePath("/admin/approvals");
}

function parseList<T extends { key: string; label: string; required: boolean }>(raw: string, prefix: string): T[] {
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line, i) => {
      const required = line.endsWith("*");
      return { key: `${prefix}${i + 1}`, label: line.replace(/\*$/, "").trim(), required } as T;
    });
}

/** B1: create or rebuild the ad text from the current JD and criteria. */
export async function generateAdvertAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p, ad } = await context(fd, ["super_admin", "hr"]);
    if (p.approvalStatus !== "approved") return fail("The ED must approve the position before it can be advertised.");
    const closingAt = ad?.closingAt ?? new Date(Date.now() + 21 * 86_400_000).toISOString();
    const body = generateAdvertBody(p, getDoc(p.id, "jd"), getDoc(p.id, "criteria"), closingAt);
    if (ad) {
      if (ad.status === "published") return fail("Unpublish the ad before rebuilding its text.");
      db.update(adverts).set({ body, updatedAt: new Date().toISOString() }).where(eq(adverts.id, ad.id)).run();
    } else {
      const faculty = p.type === "faculty";
      db.insert(adverts)
        .values({
          positionId: p.id,
          body,
          closingAt,
          questions: faculty ? [{ key: "q1", label: "When could you join if selected?", required: true }] : [{ key: "q1", label: "What is your notice period?", required: true }],
        })
        .run();
    }
    audit(user.id, "advert_generated", "position", p.id);
    refresh(p.id);
    return done("Ad text generated from the job description. Edit it below before publishing.");
  });
}

/** B1, C5, C6: edit the ad, its closing date, post-specific questions and uploads. */
export async function saveAdvertAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p, ad } = await context(fd, ["super_admin", "hr"]);
    if (!ad) return fail("Generate the ad first.");
    const closingAt = pktInputToIso(str(fd, "closingAt"));
    if (!closingAt) return fail("Set the closing date and time.", { closingAt: "Set the closing date and time." });
    const body = str(fd, "body");
    if (body.length < 50) return fail("The ad text is too short.");
    db.update(adverts)
      .set({
        body,
        closingAt,
        questions: parseList<AdvertQuestion>(str(fd, "questions"), "q"),
        extraUploads: parseList<AdvertUpload>(str(fd, "extraUploads"), "u"),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(adverts.id, ad.id))
      .run();
    const mode = str(fd, "eligibilityMode") === "block" ? "block" : "flag";
    db.update(positions).set({ eligibilityMode: mode }).where(eq(positions.id, p.id)).run();
    audit(user.id, "advert_saved", "position", p.id);
    refresh(p.id);
    return done("Ad saved.");
  });
}

/** Ads go to the ED for approval before they are published. */
export async function advertStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p, ad } = await context(fd);
    if (!ad) return fail("Generate the ad first.");
    const step = str(fd, "step");
    const comment = str(fd, "comment");
    const isHr = ["hr", "super_admin"].includes(user.role);
    const isEd = ["ed", "super_admin"].includes(user.role);
    const now = new Date().toISOString();
    const set = (status: typeof ad.status, extra: Partial<typeof adverts.$inferInsert> = {}) =>
      db.update(adverts).set({ status, updatedAt: now, ...extra }).where(eq(adverts.id, ad.id)).run();

    switch (step) {
      case "submit":
        if (!isHr || !["draft", "unpublished"].includes(ad.status)) return fail("That step isn't available now.");
        set("pending_approval");
        db.insert(approvals).values({ positionId: p.id, subject: "advert", action: "submitted", comment, userId: user.id }).run();
        for (const ed of db.select().from(users).where(eq(users.role, "ed")).all()) {
          sendEmail({ email: ed.email, userId: ed.id }, `Ad for approval: ${p.title}`, `${user.name} sent the ad for ${p.code} ${p.title} for your approval.`, { positionId: p.id });
        }
        break;
      case "approve":
        if (!isEd || ad.status !== "pending_approval") return fail("That step isn't available now.");
        if (ad.closingAt <= now) return fail("The closing date has passed. Ask HR to set a new one.");
        set("published", { publishedAt: now });
        db.insert(approvals).values({ positionId: p.id, subject: "advert", action: "ed_approved", comment, userId: user.id }).run();
        db.insert(advertRuns).values({ positionId: p.id, channel: "DU careers page", runDate: now.slice(0, 10), createdBy: user.id }).run();
        setStage(p.id, 3, user.id, "Ad published");
        break;
      case "return":
        if (!isEd || ad.status !== "pending_approval") return fail("That step isn't available now.");
        if (!comment) return fail("Say what needs to change.");
        set("draft");
        db.insert(approvals).values({ positionId: p.id, subject: "advert", action: "returned", comment, userId: user.id }).run();
        break;
      case "unpublish":
        if (!isHr || ad.status !== "published") return fail("That step isn't available now.");
        set("unpublished");
        break;
      case "republish":
        if (!isHr || ad.status !== "unpublished") return fail("That step isn't available now.");
        if (ad.closingAt <= now) return fail("The closing date has passed. Extend it first.");
        set("published");
        break;
      case "close":
        if (!isHr || !["published", "unpublished"].includes(ad.status)) return fail("That step isn't available now.");
        set("closed", { closingAt: ad.closingAt > now ? now : ad.closingAt });
        break;
      case "archive":
        if (!isHr || ad.status !== "closed") return fail("Close the ad before archiving it.");
        set("archived");
        break;
      default:
        return fail("Unknown step.");
    }
    audit(user.id, `advert_${step}`, "position", p.id, comment);
    refresh(p.id);
    return done(
      {
        submit: "Sent to the ED for approval.",
        approve: "Approved and published on the careers page.",
        return: "Returned to HR.",
        unpublish: "Unpublished. It no longer shows on the careers page.",
        republish: "Published again.",
        close: "Closed. It no longer takes applications.",
        archive: "Archived.",
      }[step] ?? "Saved.",
    );
  });
}

/** B7: extend, re-advertise or withdraw, with the reason logged. */
export async function advertLifecycleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p, ad } = await context(fd, ["super_admin", "hr", "ed"]);
    const kind = str(fd, "kind");
    const reason = str(fd, "reason");
    if (!reason) return fail("Give the reason. It is kept in the position's history.");
    const now = new Date().toISOString();
    if (kind === "withdraw") {
      db.update(positions).set({ status: "withdrawn", updatedAt: now }).where(eq(positions.id, p.id)).run();
      if (ad && ["published", "pending_approval", "unpublished"].includes(ad.status)) {
        db.update(adverts).set({ status: "closed", closingAt: now, updatedAt: now }).where(eq(adverts.id, ad.id)).run();
      }
      logPositionEvent(p.id, "withdrawn", reason, user.id);
      refresh(p.id);
      return done("Position withdrawn.");
    }
    if (!ad) return fail("There is no ad yet.");
    const closingAt = pktInputToIso(str(fd, "closingAt"));
    if (!closingAt || closingAt <= now) return fail("Pick a new closing date in the future.");
    if (kind === "extend") {
      if (!["published", "closed", "unpublished"].includes(ad.status)) return fail("Only a published or closed ad can be extended.");
      db.update(adverts)
        .set({ closingAt, status: ad.status === "closed" ? "published" : ad.status, updatedAt: now })
        .where(eq(adverts.id, ad.id))
        .run();
      logPositionEvent(p.id, "extended", `${reason} (new closing date ${closingAt.slice(0, 10)})`, user.id);
    } else if (kind === "readvertise") {
      db.update(adverts).set({ closingAt, status: "pending_approval", publishedAt: null, updatedAt: now }).where(eq(adverts.id, ad.id)).run();
      db.update(positions).set({ status: "active" }).where(eq(positions.id, p.id)).run();
      db.insert(approvals).values({ positionId: p.id, subject: "advert", action: "submitted", comment: `Re-advertise: ${reason}`, userId: user.id }).run();
      logPositionEvent(p.id, "readvertised", reason, user.id);
    } else {
      return fail("Unknown action.");
    }
    refresh(p.id);
    return done(kind === "extend" ? "Closing date extended." : "Sent to the ED to approve the re-advertisement.");
  });
}

/** B5: where and when the ad ran. */
export async function addAdvertRunAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p } = await context(fd, ["super_admin", "hr"]);
    const channel = str(fd, "channel");
    const runDate = str(fd, "runDate");
    if (!channel || !runDate) return fail("Pick the channel and the date it ran.");
    db.insert(advertRuns).values({ positionId: p.id, channel, runDate, notes: str(fd, "notes"), createdBy: user.id }).run();
    audit(user.id, "advert_run", "position", p.id, `${channel} on ${runDate}`);
    refresh(p.id);
    return done("Recorded.");
  });
}

/** Optional closing-date reminder to candidates who started an application but haven't submitted it. */
export async function closingRemindersAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, p, ad } = await context(fd, ["super_admin", "hr"]);
    if (!ad || ad.status !== "published") return fail("The ad isn't published.");
    const drafts = db
      .select({ a: applications, u: users })
      .from(applications)
      .innerJoin(users, eq(users.id, applications.candidateId))
      .where(and(eq(applications.positionId, p.id), eq(applications.status, "draft")))
      .all();
    for (const { a, u } of drafts) {
      sendTemplate(
        "closing_reminder",
        { email: u.email, userId: u.id },
        { name: u.name, position: p.title, closing: formatDateTime(ad.closingAt) + " PKT", link: appUrl(`/me/apply/${p.code}`) },
        { applicationId: a.id, positionId: p.id },
      );
    }
    audit(user.id, "closing_reminders", "position", p.id, `${drafts.length} sent`);
    return done(drafts.length ? `Reminders sent to ${drafts.length} ${drafts.length === 1 ? "candidate" : "candidates"}.` : "Nobody has an unfinished application.");
  });
}
