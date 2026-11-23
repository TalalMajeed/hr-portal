"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  adverts,
  applications,
  applicationStatusHistory,
  candidateProfiles,
  documentRequests,
  documents,
  events,
  offers,
  positions,
  users,
  type Education,
  type Experience,
  type Publication,
  type Reference,
} from "@/lib/db/schema";
import { assertUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendTemplate } from "@/lib/email";
import { buildSnapshot, nextAppNo, setApplicationStatus } from "@/lib/applications";
import { checkEligibility } from "@/lib/eligibility";
import { getDoc, setStage } from "@/lib/positions";
import { isFile, saveUpload } from "@/lib/uploads";
import { detectDuplicate } from "@/lib/duplicates";
import { advertIsOpen, emailHr, getProfile, profileDocuments } from "@/lib/candidate";
import { documentKindLabel, ROUND_LABELS, TIMEZONES } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { STATEMENT_LABELS } from "@/components/applications/profile-view";
import { done, fail, safe, str, type ActionState } from "@/lib/action-state";

/* ------------------------------------------------------------------ */
/* Profile (C1, C2, C4, C12)                                           */
/* ------------------------------------------------------------------ */

const personalSchema = z.object({
  name: z.string().min(2, "Enter your full name."),
  phone: z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a mobile number with country code."),
  cnic: z.union([z.literal(""), z.string().regex(/^\d{5}-?\d{7}-?\d$/, "Enter the CNIC as 12345-1234567-1.")]),
  dateOfBirth: z.union([z.literal(""), z.iso.date("Enter a valid date.")]),
});

export async function savePersonalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["candidate"]);
    const parsed = personalSchema.safeParse({ name: str(fd, "name"), phone: str(fd, "phone"), cnic: str(fd, "cnic"), dateOfBirth: str(fd, "dateOfBirth") });
    if (!parsed.success) {
      return fail("Check the highlighted fields.", Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    }
    const timezone = str(fd, "timezone");
    const values = {
      cnic: parsed.data.cnic,
      dateOfBirth: parsed.data.dateOfBirth,
      gender: str(fd, "gender"),
      domicile: str(fd, "domicile"),
      province: str(fd, "province"),
      address: str(fd, "address"),
      city: str(fd, "city"),
      country: str(fd, "country") || "Pakistan",
      timezone: TIMEZONES.some((t) => t.value === timezone) ? timezone : "Asia/Karachi",
      researchInterests: str(fd, "researchInterests"),
      updatedAt: new Date().toISOString(),
    };
    await db.update(users).set({ name: parsed.data.name, phone: parsed.data.phone }).where(eq(users.id, user.id));
    const existing = (await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)))[0];
    if (existing) await db.update(candidateProfiles).set(values).where(eq(candidateProfiles.userId, user.id));
    else await db.insert(candidateProfiles).values({ userId: user.id, ...values });
    await audit(user.id, "profile_updated", "user", user.id, "personal details");
    revalidatePath("/me/profile");
    return done("Personal details saved.");
  });
}

const s = (max = 300) => z.string().trim().max(max).default("");

const sectionSchemas = {
  education: z.array(
    z.object({
      institution: z.string().trim().min(2, "Each qualification needs an institution."),
      degree: z.string().trim().min(2, "Each qualification needs a degree title."),
      level: z.enum(["1", "2", "3", "4", "5", "6"], { message: "Choose a level for each qualification." }),
      field: s(),
      year: z.string().trim().regex(/^(19|20)\d{2}$/, "Enter the year as four digits, such as 2018."),
      grade: s(40),
    }),
  ),
  experience: z.array(
    z.object({
      employer: z.string().trim().min(2, "Each job needs an employer."),
      designation: z.string().trim().min(2, "Each job needs a designation."),
      from: z.iso.date("Each job needs a start date."),
      to: z.union([z.literal(""), z.iso.date()]).default(""),
      current: z.boolean().default(false),
      duties: s(1000),
    }),
  ),
  publications: z.array(
    z.object({
      title: z.string().trim().min(3, "Each publication needs a title."),
      journal: z.string().trim().min(2, "Each publication needs a journal or book."),
      year: z.string().trim().regex(/^(19|20)\d{2}$/, "Enter the publication year as four digits."),
      status: z.enum(["published", "accepted", "under_review"]),
      authors: z.string().trim().min(2, "List all authors in order."),
      authorPosition: z.coerce.number().int().min(1, "Your author position starts at 1.").max(100),
      articleType: z.enum(["original_research", "review", "book_chapter"]),
      doi: s(300),
      quartile: z.enum(["", "Q1", "Q2", "Q3", "Q4"]).default(""),
    }),
  ),
  references: z.array(
    z.object({
      name: z.string().trim().min(2, "Each reference needs a name."),
      designation: s(),
      organisation: s(),
      email: z.union([z.literal(""), z.email("Enter a valid reference email.")]).default(""),
      phone: s(40),
    }),
  ),
};

export async function saveSectionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["candidate"]);
    const section = str(fd, "section") as keyof typeof sectionSchemas;
    const schema = sectionSchemas[section];
    if (!schema) return fail("Unknown section.");
    let raw: unknown;
    try {
      raw = JSON.parse(str(fd, "rows") || "[]");
    } catch {
      return fail("Couldn't read the form. Reload the page and try again.");
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const row = typeof first.path[0] === "number" ? ` (entry ${first.path[0] + 1})` : "";
      return fail(`${first.message}${row}`);
    }
    if (section === "publications") {
      for (const [i, p] of (parsed.data as Publication[]).entries()) {
        const count = p.authors.split(/;|,| and /).filter((a) => a.trim()).length;
        if (p.authorPosition > count) return fail(`Your author position is higher than the number of authors listed (entry ${i + 1}). Separate authors with semicolons.`);
      }
    }
    const values: Partial<typeof candidateProfiles.$inferInsert> = { updatedAt: new Date().toISOString() };
    if (section === "education") values.education = parsed.data as Education[];
    if (section === "experience") values.experience = (parsed.data as Experience[]).map((e) => ({ ...e, to: e.current ? "" : e.to }));
    if (section === "publications") values.publications = parsed.data as Publication[];
    if (section === "references") values.references = parsed.data as Reference[];
    const existing = (await db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)))[0];
    if (existing) await db.update(candidateProfiles).set(values).where(eq(candidateProfiles.userId, user.id));
    else await db.insert(candidateProfiles).values({ userId: user.id, ...values });
    await audit(user.id, "profile_updated", "user", user.id, section);
    revalidatePath("/me/profile");
    return done("Saved.");
  });
}

const PROFILE_KINDS = ["cv", "degree", "experience_letter", "cnic", "photo", "other"] as const;

export async function uploadProfileDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["candidate"]);
    const kind = str(fd, "kind") as (typeof PROFILE_KINDS)[number];
    if (!PROFILE_KINDS.includes(kind)) return fail("Choose what kind of document this is.");
    const file = fd.get("file");
    if (!isFile(file)) return fail("Choose a file to upload.");
    if (kind === "photo" && !/\.(jpe?g|png)$/i.test(file.name)) return fail("The photograph must be a JPG or PNG.");
    const r = await saveUpload(file, { kind, ownerUserId: user.id, uploadedBy: user.id, label: str(fd, "label") || documentKindLabel(kind) });
    if (!r.ok) return fail(r.error);
    revalidatePath("/me/profile");
    return done(`${file.name} uploaded.`);
  });
}

export async function deleteProfileDocumentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["candidate"]);
    const id = Number(str(fd, "id"));
    const doc = (await db.select().from(documents).where(eq(documents.id, id)))[0];
    if (!doc || doc.ownerUserId !== user.id || doc.applicationId) return fail("That document can't be removed.");
    // Submitted applications keep their own frozen list; only unlink the file from the profile.
    const referenced = (await db
      .select({ snapshot: applications.snapshot })
      .from(applications)
      .where(eq(applications.candidateId, user.id))
      )
      .some((a) => a.snapshot?.documents.some((d) => d.id === id));
    if (referenced) {
      await db.update(documents).set({ ownerUserId: null, label: `${doc.label || documentKindLabel(doc.kind)} (removed from profile)` }).where(eq(documents.id, id));
    } else {
      await db.delete(documents).where(eq(documents.id, id));
    }
    await audit(user.id, "document_removed", "document", id, doc.filename);
    revalidatePath("/me/profile");
    return done("Document removed.");
  });
}

/* ------------------------------------------------------------------ */
/* Apply (C5 to C8)                                                    */
/* ------------------------------------------------------------------ */

export async function saveApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["candidate"]);
    const intent = str(fd, "intent") === "submit" ? "submit" : "draft";
    const positionId = Number(str(fd, "positionId"));
    const row = (await db
      .select({ position: positions, advert: adverts })
      .from(positions)
      .innerJoin(adverts, eq(adverts.positionId, positions.id))
      .where(eq(positions.id, positionId))
      )[0];
    if (!row) return fail("This position no longer exists.");
    const { position, advert } = row;
    if (!advertIsOpen(advert)) return fail("This position has closed and no longer takes applications.");
    if (!user.emailVerified) return fail("Verify your email before you apply.");

    let app = (await db
      .select()
      .from(applications)
      .where(and(eq(applications.positionId, position.id), eq(applications.candidateId, user.id)))
      )[0];
    if (app && app.status !== "draft") return fail(`You have already applied for this post (${app.appNo}). Only one application per post is allowed.`);

    const answers: Record<string, string> = {};
    if (position.type === "faculty") for (const k of Object.keys(STATEMENT_LABELS)) answers[k] = str(fd, k).slice(0, 8000);
    for (const q of advert.questions) answers[q.key] = str(fd, q.key).slice(0, 4000);
    const consent = fd.get("consent") === "on";

    if (!app) {
      app = (await db.insert(applications).values({ positionId: position.id, candidateId: user.id, status: "draft", answers, consent }).returning())[0];
      await audit(user.id, "draft_started", "application", app.id, position.code);
    } else {
      await db.update(applications).set({ answers, consent, updatedAt: new Date().toISOString() }).where(eq(applications.id, app.id));
    }

    // Post-specific uploads go on the application itself.
    for (const u of advert.extraUploads) {
      const file = fd.get(`upload_${u.key}`);
      if (!isFile(file)) continue;
      const r = await saveUpload(file, { kind: "extra", ownerUserId: user.id, applicationId: app.id, uploadedBy: user.id, label: u.label });
      if (!r.ok) return fail(r.error);
    }
    revalidatePath(`/me/apply/${position.code}`);
    revalidatePath("/me");

    if (intent === "draft") return done("Draft saved. You can come back and submit it before the closing date.");

    // Submission checks.
    const missing: string[] = [];
    if (position.type === "faculty") {
      for (const [k, label] of Object.entries(STATEMENT_LABELS)) if (answers[k].length < 50) missing.push(`${label} (at least 50 characters)`);
    }
    for (const q of advert.questions) if (q.required && !answers[q.key]) missing.push(q.label);
    const appDocs = (await db.select().from(documents).where(eq(documents.applicationId, app.id)));
    for (const u of advert.extraUploads) if (u.required && !appDocs.some((d) => d.label === u.label)) missing.push(u.label);
    const profile = await getProfile(user.id);
    if (!profile.education.length) missing.push("At least one qualification in your profile");
    const docKinds = (await profileDocuments(user.id)).map((d) => d.kind);
    const jd = await getDoc(position.id, "jd");
    for (const kind of jd?.requiredDocuments ?? []) if (!docKinds.includes(kind as never)) missing.push(`${documentKindLabel(kind)} in your profile documents`);
    if (!consent) missing.push("Your consent to DU processing your data");
    if (missing.length) return fail(`Before you submit, add: ${missing.join("; ")}.`);

    const eligibility = checkEligibility(await getDoc(position.id, "criteria"), profile, docKinds);
    if (!eligibility.passed && position.eligibilityMode === "block") {
      const unmet = eligibility.items.filter((i) => i.mandatory && !i.met).map((i) => `${i.label} (${i.note})`);
      await audit(user.id, "application_blocked", "application", app.id, unmet.join("; "));
      return fail(`You don't meet these required criteria, so this post can't accept your application: ${unmet.join("; ")}.`);
    }

    const now = new Date().toISOString();
    const appNo = await nextAppNo(position.code, position.id);
    await db.update(applications)
      .set({ appNo, status: "applied", eligibility, snapshot: await buildSnapshot(user.id), submittedAt: now, updatedAt: now })
      .where(eq(applications.id, app.id))
      ;
    await db.insert(applicationStatusHistory).values({ applicationId: app.id, fromStatus: "draft", toStatus: "applied", userId: user.id });
    await audit(user.id, "application_submitted", "application", app.id, `${appNo}${eligibility.passed ? "" : " (flagged: criteria not met)"}`);
    await sendTemplate(
      "application_received",
      { email: user.email, userId: user.id },
      { name: user.name, position: position.title, app_no: appNo, submitted_at: `${formatDateTime(now)} PKT` },
      { applicationId: app.id, positionId: position.id },
    );
    await detectDuplicate(app.id, user.id);
    await setStage(position.id, 4, user.id, "Applications received");
    revalidatePath("/me");
    redirect(`/me/applications/${app.id}?submitted=1`);
  });
}

async function ownApplication(applicationId: number) {
  const user = await assertUser(["candidate"]);
  const row = (await db
    .select({ app: applications, position: positions, advert: adverts })
    .from(applications)
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(adverts, eq(adverts.positionId, positions.id))
    .where(and(eq(applications.id, applicationId), eq(applications.candidateId, user.id)))
    )[0];
  if (!row) throw new Error("That application isn't yours.");
  return { user, ...row };
}

export async function withdrawApplicationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const { user, app, advert } = await ownApplication(Number(str(fd, "applicationId")));
    if (!advertIsOpen(advert)) return fail("The closing date has passed, so this application can't be withdrawn here. Contact DU HR.");
    if (["withdrawn", "selected", "not_selected"].includes(app.status)) return fail("This application can't be withdrawn.");
    if (app.status === "draft") {
      await db.delete(documents).where(eq(documents.applicationId, app.id));
      await db.delete(applications).where(eq(applications.id, app.id));
      await audit(user.id, "draft_deleted", "application", app.id);
      revalidatePath("/me");
      redirect("/me");
    }
    await db.update(applications).set({ withdrawnAt: new Date().toISOString() }).where(eq(applications.id, app.id));
    await setApplicationStatus(app.id, "withdrawn", user.id, { note: "Withdrawn by the candidate" });
    revalidatePath(`/me/applications/${app.id}`);
    revalidatePath("/me");
    return done("Your application has been withdrawn.");
  });
}

/* ------------------------------------------------------------------ */
/* Documents asked for later (C9)                                      */
/* ------------------------------------------------------------------ */

export async function fulfilDocumentRequestAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const requestId = Number(str(fd, "requestId"));
    const req = (await db.select().from(documentRequests).where(eq(documentRequests.id, requestId)))[0];
    if (!req) return fail("That request no longer exists.");
    const { user, app, position } = await ownApplication(req.applicationId);
    if (req.status !== "open") return fail("You've already uploaded this document.");
    const file = fd.get("file");
    if (!isFile(file)) return fail("Choose a file to upload.");
    const r = await saveUpload(file, { kind: "other", ownerUserId: user.id, applicationId: app.id, uploadedBy: user.id, label: req.label });
    if (!r.ok) return fail(r.error);
    await db.update(documentRequests).set({ status: "fulfilled", documentId: r.id }).where(eq(documentRequests.id, req.id));
    await audit(user.id, "document_request_fulfilled", "application", app.id, req.label);
    await emailHr(`Document uploaded: ${app.appNo}`, `${user.name} uploaded "${req.label}" for application ${app.appNo} (${position.title}).`, {
      applicationId: app.id,
      positionId: position.id,
    });
    revalidatePath(`/me/applications/${app.id}`);
    revalidatePath("/me");
    return done("Uploaded. HR has been told.");
  });
}

/* ------------------------------------------------------------------ */
/* Invitations (F3) and offers (H3)                                    */
/* ------------------------------------------------------------------ */

export async function respondToEventAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["candidate"]);
    const eventId = Number(str(fd, "eventId"));
    const intent = str(fd, "intent");
    const note = str(fd, "note").slice(0, 1000);
    const row = (await db
      .select({ event: events, app: applications, position: positions })
      .from(events)
      .innerJoin(applications, eq(applications.id, events.applicationId))
      .innerJoin(positions, eq(positions.id, events.positionId))
      .where(and(eq(events.id, eventId), eq(applications.candidateId, user.id)))
      )[0];
    if (!row) return fail("That invitation isn't yours.");
    const { event, app, position } = row;
    if (["cancelled", "completed"].includes(event.status)) return fail("This session is no longer open for replies.");
    if (event.startsAt < new Date().toISOString()) return fail("This session has already started.");
    const map = { confirm: "confirmed", decline: "declined", reschedule: "reschedule_requested" } as const;
    const status = map[intent as keyof typeof map];
    if (!status) return fail("Choose a reply.");
    if (status === "reschedule_requested" && note.length < 5) return fail("Tell HR which times suit you better.");
    await db.update(events).set({ status, candidateNote: note, updatedAt: new Date().toISOString() }).where(eq(events.id, event.id));
    await audit(user.id, `event_${status}`, "event", event.id, note);
    const session = ROUND_LABELS[event.round].toLowerCase();
    const reply = { confirmed: "confirmed", declined: "declined", reschedule_requested: "asked for another time for" }[status];
    await emailHr(
      `${user.name} ${reply} the ${session}: ${position.title}`,
      `${user.name} (${app.appNo}) ${reply} the ${session} on ${formatDateTime(event.startsAt)} PKT for ${position.title}.${note ? `\n\nTheir note: ${note}` : ""}`,
      { applicationId: app.id, positionId: position.id },
    );
    revalidatePath("/me");
    revalidatePath(`/me/applications/${app.id}`);
    return done(
      status === "confirmed"
        ? "Thanks, you're confirmed. You can add it to your calendar."
        : status === "declined"
          ? "You've declined this session. HR has been told."
          : "HR has your request and will send a new time.",
    );
  });
}

export async function respondToOfferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["candidate"]);
    const offerId = Number(str(fd, "offerId"));
    const intent = str(fd, "intent");
    const row = (await db
      .select({ offer: offers, app: applications, position: positions })
      .from(offers)
      .innerJoin(applications, eq(applications.id, offers.applicationId))
      .innerJoin(positions, eq(positions.id, offers.positionId))
      .where(and(eq(offers.id, offerId), eq(applications.candidateId, user.id)))
      )[0];
    if (!row) return fail("That offer isn't yours.");
    if (row.offer.status !== "sent") return fail("You've already replied to this offer.");
    if (intent !== "accept" && intent !== "decline") return fail("Choose accept or decline.");
    const status = intent === "accept" ? "accepted" : "declined";
    await db.update(offers).set({ status, respondedAt: new Date().toISOString() }).where(eq(offers.id, row.offer.id));
    await audit(user.id, `offer_${status}`, "offer", row.offer.id, row.app.appNo ?? "");
    await emailHr(`Offer ${status}: ${row.position.title}`, `${user.name} (${row.app.appNo}) has ${status} the offer for ${row.position.title}.`, {
      applicationId: row.app.id,
      positionId: row.position.id,
    });
    revalidatePath("/me");
    revalidatePath(`/me/applications/${row.app.id}`);
    return done(status === "accepted" ? "Congratulations. HR will be in touch about joining." : "You've declined the offer. Thank you for letting us know.");
  });
}
