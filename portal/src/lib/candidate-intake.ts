import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, applicationStatusHistory, candidateProfiles, positions, users, type Education, type Experience } from "@/lib/db/schema";
import { buildSnapshot, nextAppNo } from "@/lib/applications";
import { checkEligibility } from "@/lib/eligibility";
import { getDoc, setStage } from "@/lib/positions";
import { saveUpload } from "@/lib/uploads";
import { detectDuplicate } from "@/lib/duplicates";
import { audit } from "@/lib/audit";
import { slug } from "@/lib/format";
import { profileDocuments } from "@/lib/candidate";

export type SourcedCandidate = {
  positionId: number;
  name: string;
  email?: string;
  phone: string;
  cnic: string;
  level: string;
  degree: string;
  field: string;
  institution: string;
  years: number;
  source: "direct" | "agency" | "referral";
  agencyId?: number | null;
  actorId: number;
  cv?: File | null;
};

export type IntakeResult = { ok: true; applicationId: number; appNo: string; duplicateOf: string | null } | { ok: false; error: string };

/**
 * Creates a candidate and a submitted application on someone else's behalf: an agency
 * uploading a sourced candidate (B6), or HR importing existing candidates from a sheet.
 * Candidates without an email get a placeholder address and never receive emails.
 */
export async function createSourcedApplication(c: SourcedCandidate): Promise<IntakeResult> {
  const position = db.select().from(positions).where(eq(positions.id, c.positionId)).get();
  if (!position) return { ok: false, error: "That position doesn't exist." };
  if (c.name.trim().length < 2) return { ok: false, error: "A name is needed." };

  const email = (c.email ?? "").trim().toLowerCase();
  let user = email ? db.select().from(users).where(eq(users.email, email)).get() : undefined;
  if (user && user.role !== "candidate") return { ok: false, error: `${email} belongs to a staff account.` };
  if (user) {
    const existing = db
      .select()
      .from(applications)
      .where(and(eq(applications.positionId, position.id), eq(applications.candidateId, user.id)))
      .get();
    if (existing) return { ok: false, error: `${c.name} has already applied for this post (${existing.appNo ?? "draft"}).` };
  }

  if (!user) {
    const address = email || `${slug(c.name) || "candidate"}.${randomBytes(4).toString("hex")}@placeholder.local`;
    user = db
      .insert(users)
      .values({ name: c.name.trim(), email: address, phone: c.phone.trim(), role: "candidate", passwordHash: null, emailVerified: false })
      .returning()
      .get();
    const education: Education[] = c.degree
      ? [{ institution: c.institution.trim(), degree: c.degree.trim(), level: c.level || "4", field: c.field.trim(), year: "", grade: "" }]
      : [];
    const experience: Experience[] =
      c.years > 0
        ? [
            {
              employer: "As stated by the source",
              designation: "",
              from: new Date(Date.now() - c.years * 365.25 * 86_400_000).toISOString().slice(0, 10),
              to: "",
              current: true,
              duties: `${c.years} years of relevant experience, as stated by the ${c.source === "agency" ? "agency" : "source"}.`,
            },
          ]
        : [];
    db.insert(candidateProfiles).values({ userId: user.id, cnic: c.cnic.trim(), education, experience }).run();
  }

  if (c.cv) {
    const up = await saveUpload(c.cv, { kind: "cv", ownerUserId: user.id, uploadedBy: c.actorId, label: "CV" });
    if (!up.ok) return { ok: false, error: up.error };
  }

  const profile = db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, user.id)).get()!;
  const docKinds = profileDocuments(user.id).map((d) => d.kind);
  const eligibility = checkEligibility(getDoc(position.id, "criteria"), profile, docKinds);
  const now = new Date().toISOString();
  const appNo = nextAppNo(position.code, position.id);
  const app = db
    .insert(applications)
    .values({
      appNo,
      positionId: position.id,
      candidateId: user.id,
      source: c.source,
      agencyId: c.agencyId ?? null,
      status: "applied",
      eligibility,
      snapshot: buildSnapshot(user.id),
      consent: true,
      submittedAt: now,
    })
    .returning()
    .get();
  db.insert(applicationStatusHistory).values({ applicationId: app.id, fromStatus: null, toStatus: "applied", note: `Added by ${c.source}`, userId: c.actorId }).run();
  audit(c.actorId, "application_created", "application", app.id, `${appNo} for ${c.name} (${c.source})`);
  const dup = detectDuplicate(app.id, c.actorId);
  setStage(position.id, 4, c.actorId, "Applications received");
  return { ok: true, applicationId: app.id, appNo, duplicateOf: dup?.appNo ?? null };
}
