"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  approvals,
  jdTemplates,
  positions,
  users,
  type CriteriaContent,
  type Criterion,
  type JdContent,
  type RubricContent,
  type RubricItem,
} from "@/lib/db/schema";
import { assertUser, type SessionUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { EMPTY_JD, EMPTY_RUBRIC, getDoc, getPosition, nextPositionCode, saveDoc, setStage } from "@/lib/positions";
import { done, fail, lines, num, safe, str, type ActionState } from "@/lib/action-state";
import { STAFF_ROLES } from "@/lib/constants";

async function load(user: SessionUser, id: number) {
  const p = await getPosition(id);
  if (!p || !canManagePosition(user, p)) throw new Error("Position not found.");
  return p;
}

function positionFields(fd: FormData) {
  const type = str(fd, "type") === "faculty" ? "faculty" : "administrative";
  return {
    title: str(fd, "title"),
    type,
    department: str(fd, "department"),
    category: str(fd, "category"),
    posts: Math.max(1, Math.round(num(fd, "posts", 1))),
    grade: str(fd, "grade"),
    reportingLine: str(fd, "reportingLine"),
    budgetLine: str(fd, "budgetLine"),
    justification: str(fd, "justification"),
    discipline: type === "faculty" ? str(fd, "discipline") : "",
    rank: type === "faculty" ? str(fd, "rank") : "",
    researchArea: type === "faculty" ? str(fd, "researchArea") : "",
    teachingAreas: type === "faculty" ? str(fd, "teachingAreas") : "",
  } as const;
}

function validate(f: ReturnType<typeof positionFields>) {
  const errors: Record<string, string> = {};
  if (f.title.length < 3) errors.title = "Enter the position title.";
  if (!f.department) errors.department = "Choose a department or discipline.";
  if (!f.grade) errors.grade = "Enter the grade or pay band.";
  if (!f.justification) errors.justification = "Say why the post is needed.";
  if (f.type === "faculty" && !f.rank) errors.rank = "Choose the rank.";
  return errors;
}

/** A1, A5: create a position request. The hiring lead drafts it; HR and the ED approve it. */
export async function createPositionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await assertUser(["super_admin", "hr", "hiring_lead"]);
  const f = positionFields(fd);
  const errors = validate(f);
  if (Object.keys(errors).length) return fail("Check the highlighted fields.", errors);
  const hiringLeadId = user.role === "hiring_lead" ? user.id : Number(str(fd, "hiringLeadId")) || null;
  const row = (await db
    .insert(positions)
    .values({ ...f, code: await nextPositionCode(), hiringLeadId, createdBy: user.id })
    .returning()
    )[0];
  const tpl = (await db.select().from(jdTemplates).where(eq(jdTemplates.type, f.type)))[0];
  await saveDoc(row.id, "jd", tpl?.content ?? EMPTY_JD, user.id, tpl ? `Started from template "${tpl.name}"` : "Blank");
  await saveDoc(row.id, "criteria", { items: [] }, user.id, "Blank");
  await saveDoc(row.id, "rubric", EMPTY_RUBRIC, user.id, "Blank");
  await saveDoc(row.id, "tor_position", { body: "" }, user.id, "Blank");
  await saveDoc(row.id, "tor_committee", { body: "" }, user.id, "Blank");
  await audit(user.id, "position_created", "position", row.id, `${row.code} ${row.title}`);
  redirect(`/admin/positions/${row.id}/setup`);
}

export async function updatePositionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["super_admin", "hr", "hiring_lead", "ed"]);
    const p = await load(user, num(fd, "id"));
    const f = positionFields(fd);
    const errors = validate(f);
    if (Object.keys(errors).length) return fail("Check the highlighted fields.", errors);
    const hiringLeadId = Number(str(fd, "hiringLeadId")) || p.hiringLeadId;
    await db.update(positions)
      .set({ ...f, hiringLeadId, updatedAt: new Date().toISOString() })
      .where(eq(positions.id, p.id))
      ;
    await audit(user.id, "position_updated", "position", p.id);
    revalidatePath(`/admin/positions/${p.id}`, "layout");
    return done("Position saved.");
  });
}

async function notify(role: "hr" | "ed", subject: string, body: string, positionId: number) {
  for (const u of (await db.select().from(users).where(eq(users.role, role)))) {
    if (u.active) await sendEmail({ email: u.email, userId: u.id }, subject, body, { positionId });
  }
}

/**
 * A2: the approval workflow. Hiring lead submits to HR, HR reviews and sends to the ED,
 * the ED approves or returns. Every step is time-stamped with a comment.
 */
export async function approvalStepAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(STAFF_ROLES);
    const p = await load(user, num(fd, "id"));
    const step = str(fd, "step");
    const comment = str(fd, "comment");
    const isHr = ["hr", "super_admin"].includes(user.role);
    const isEd = ["ed", "super_admin"].includes(user.role);
    let next = p.approvalStatus;
    let action = step;

    if (step === "submit" && ["draft", "returned"].includes(p.approvalStatus)) {
      const jd = await getDoc(p.id, "jd");
      if (!jd?.duties.length || !jd.requiredQualifications.length) return fail("Add duties and required qualifications to the job description before sending it for approval.");
      next = "hr_review";
      action = "submitted";
      await notify("hr", `Position for review: ${p.title}`, `${user.name} sent ${p.code} ${p.title} for HR review.\n\n${comment}`, p.id);
    } else if (step === "hr_approve" && p.approvalStatus === "hr_review" && isHr) {
      next = "ed_review";
      action = "hr_reviewed";
      await notify("ed", `Position for approval: ${p.title}`, `HR reviewed ${p.code} ${p.title} and sent it for your approval.\n\n${comment}`, p.id);
    } else if (step === "ed_approve" && p.approvalStatus === "ed_review" && isEd) {
      next = "approved";
      action = "ed_approved";
    } else if (step === "return" && ((p.approvalStatus === "hr_review" && isHr) || (p.approvalStatus === "ed_review" && isEd))) {
      if (!comment) return fail("Say what needs to change before returning it.");
      next = "returned";
      action = "returned";
    } else {
      return fail("That step isn't available now.");
    }

    await db.update(positions).set({ approvalStatus: next, updatedAt: new Date().toISOString() }).where(eq(positions.id, p.id));
    await db.insert(approvals).values({ positionId: p.id, subject: "position", action, comment, userId: user.id });
    await audit(user.id, `position_${action}`, "position", p.id, comment);
    if (next === "approved") await setStage(p.id, 2, user.id, "Position approved");
    revalidatePath(`/admin/positions/${p.id}`, "layout");
    revalidatePath("/admin/approvals");
    return done(
      { submitted: "Sent to HR for review.", hr_reviewed: "Sent to the ED for approval.", ed_approved: "Position approved.", returned: "Returned with your comment." }[action] ?? "Saved.",
    );
  });
}

/** A3: ToRs for the position and for its interview committee. */
export async function saveTorsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["super_admin", "hr", "hiring_lead", "ed"]);
    const p = await load(user, num(fd, "id"));
    const note = str(fd, "note");
    const pos = str(fd, "tor_position");
    const com = str(fd, "tor_committee");
    const posChanged = pos !== ((await getDoc(p.id, "tor_position"))?.body ?? "");
    const comChanged = com !== ((await getDoc(p.id, "tor_committee"))?.body ?? "");
    if (posChanged) await saveDoc(p.id, "tor_position", { body: pos }, user.id, note);
    if (comChanged) await saveDoc(p.id, "tor_committee", { body: com }, user.id, note);
    revalidatePath(`/admin/positions/${p.id}/setup`);
    return done(posChanged || comChanged ? "ToRs saved as a new version." : "No changes to save.");
  });
}

/** A4: the job description, optionally restarted from a template. */
export async function saveJdAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["super_admin", "hr", "hiring_lead", "ed"]);
    const p = await load(user, num(fd, "id"));
    const templateId = num(fd, "templateId");
    let jd: JdContent;
    if (templateId) {
      const tpl = (await db.select().from(jdTemplates).where(eq(jdTemplates.id, templateId)))[0];
      if (!tpl) return fail("Template not found.");
      jd = tpl.content;
      await saveDoc(p.id, "jd", jd, user.id, `Replaced with template "${tpl.name}"`);
    } else {
      jd = {
        summary: str(fd, "summary"),
        duties: lines(fd, "duties"),
        requiredQualifications: lines(fd, "requiredQualifications"),
        preferredQualifications: lines(fd, "preferredQualifications"),
        experience: str(fd, "experience"),
        skills: lines(fd, "skills"),
        requiredDocuments: fd.getAll("requiredDocuments").map(String),
      };
      if (!jd.duties.length) return fail("Add at least one duty.");
      await saveDoc(p.id, "jd", jd, user.id, str(fd, "note"));
    }
    revalidatePath(`/admin/positions/${p.id}/setup`);
    return done("Job description saved as a new version.");
  });
}

/** A6: eligibility criteria, each mandatory or desirable. Sent as JSON from the criteria editor. */
export async function saveCriteriaAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["super_admin", "hr", "hiring_lead", "ed"]);
    const p = await load(user, num(fd, "id"));
    let items: Criterion[];
    try {
      items = (JSON.parse(str(fd, "items") || "[]") as Criterion[]).filter((c) => c.label.trim());
    } catch {
      return fail("The criteria couldn't be read. Reload the page and try again.");
    }
    for (const c of items) {
      if (["qualification", "experience", "cgpa", "age"].includes(c.type) && !c.value) return fail(`"${c.label}" needs a value.`);
      if (c.type === "age" && !c.cutoffDate) return fail(`"${c.label}" needs the cut-off date for the age limit.`);
    }
    const content: CriteriaContent = { items: items.map((c, i) => ({ ...c, key: c.key || `c${i + 1}`, label: c.label.trim() })) };
    await saveDoc(p.id, "criteria", content, user.id, str(fd, "note"));
    const mode = str(fd, "eligibilityMode") === "block" ? "block" : "flag";
    if (mode !== p.eligibilityMode) {
      await db.update(positions).set({ eligibilityMode: mode }).where(eq(positions.id, p.id));
      await audit(user.id, "eligibility_mode", "position", p.id, mode);
    }
    revalidatePath(`/admin/positions/${p.id}/setup`);
    return done("Criteria saved as a new version.");
  });
}

/** A7: the rubric that follows the position into shortlisting and every interview round. */
export async function saveRubricAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["super_admin", "hr", "hiring_lead", "ed"]);
    const p = await load(user, num(fd, "id"));
    let rubric: RubricContent;
    try {
      rubric = { ...EMPTY_RUBRIC, ...(JSON.parse(str(fd, "rubric") || "{}") as RubricContent) };
    } catch {
      return fail("The rubric couldn't be read. Reload the page and try again.");
    }
    for (const [round, items] of Object.entries(rubric) as [keyof RubricContent, RubricItem[]][]) {
      rubric[round] = items
        .filter((i) => i.label.trim())
        .map((i, n) => ({
          key: i.key || `${round}_${n + 1}`,
          label: i.label.trim(),
          weight: Math.max(0, Number(i.weight) || 0),
          maxScore: Math.max(1, Number(i.maxScore) || 10),
          minScore: Math.max(0, Number(i.minScore) || 0),
        }));
      const total = rubric[round].reduce((s, i) => s + i.weight, 0);
      if (rubric[round].length && total !== 100) return fail(`The weights for ${round.replace("_", " ")} add up to ${total}. They must add up to 100.`);
      if (rubric[round].some((i) => i.minScore > i.maxScore)) return fail("A minimum score can't be higher than the maximum.");
    }
    await saveDoc(p.id, "rubric", rubric, user.id, str(fd, "note"));
    revalidatePath(`/admin/positions/${p.id}/setup`);
    return done("Rubric saved as a new version.");
  });
}

/** A8: brings back an older version as the newest one; the history keeps both. */
export async function restoreVersionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["super_admin", "hr", "hiring_lead", "ed"]);
    const p = await load(user, num(fd, "id"));
    const docId = num(fd, "docId");
    const old = (await db.query.positionDocs.findFirst({ where: (d, { and, eq: e }) => and(e(d.id, docId), e(d.positionId, p.id)) }));
    if (!old) return fail("Version not found.");
    await saveDoc(p.id, old.kind, old.content as never, user.id, `Restored version ${old.version}`);
    revalidatePath(`/admin/positions/${p.id}/setup`);
    return done(`Version ${old.version} restored as the newest version.`);
  });
}

export async function setPositionStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["super_admin", "hr", "ed"]);
    const p = await load(user, num(fd, "id"));
    const status = str(fd, "status") as typeof p.status;
    if (!["active", "on_hold", "filled", "withdrawn"].includes(status)) return fail("Unknown status.");
    const reason = str(fd, "reason");
    if (status !== "active" && !reason) return fail("Give a reason.");
    await db.update(positions).set({ status, updatedAt: new Date().toISOString() }).where(eq(positions.id, p.id));
    await audit(user.id, "position_status", "position", p.id, `${status}: ${reason}`);
    revalidatePath(`/admin/positions/${p.id}`, "layout");
    return done("Status updated.");
  });
}
