import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  applicationStatusHistory,
  candidateProfiles,
  documents,
  positions,
  users,
  type ApplicationStatus,
  type ProfileSnapshot,
} from "@/lib/db/schema";
import { APPLICATION_STATUS } from "@/lib/constants";
import { audit } from "@/lib/audit";
import { sendTemplate } from "@/lib/email";

/** "DU-2026-003-0007" */
export function nextAppNo(positionCode: string, positionId: number) {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(applications)
    .where(sql`${applications.positionId} = ${positionId} and ${applications.appNo} is not null`)
    .get();
  return `${positionCode}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

/** C8: freezes the profile and documents as they are now. */
export function buildSnapshot(candidateId: number): ProfileSnapshot {
  const user = db.select().from(users).where(eq(users.id, candidateId)).get();
  const profile = db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, candidateId)).get();
  const docs = db
    .select({ id: documents.id, kind: documents.kind, filename: documents.filename })
    .from(documents)
    .where(sql`${documents.ownerUserId} = ${candidateId} and ${documents.applicationId} is null`)
    .all();
  const { id: _id, userId: _u, updatedAt: _t, ...rest } = profile ?? emptyProfile(candidateId);
  void _id;
  void _u;
  void _t;
  return { name: user?.name ?? "", email: user?.email ?? "", phone: user?.phone ?? "", profile: rest, documents: docs };
}

export function emptyProfile(userId: number): typeof candidateProfiles.$inferSelect {
  return {
    id: 0,
    userId,
    cnic: "",
    dateOfBirth: "",
    gender: "",
    domicile: "",
    province: "",
    address: "",
    city: "",
    country: "Pakistan",
    timezone: "Asia/Karachi",
    education: [],
    experience: [],
    publications: [],
    references: [],
    researchInterests: "",
    updatedAt: "",
  };
}

/**
 * C10: changes the status the candidate sees, records it, and emails the candidate.
 * Pass `notify: false` for silent internal changes.
 */
export function setApplicationStatus(
  applicationId: number,
  to: ApplicationStatus,
  userId: number | null,
  opts: { note?: string; notify?: boolean; message?: string } = {},
) {
  const app = db
    .select({ app: applications, position: positions, candidate: users })
    .from(applications)
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(eq(applications.id, applicationId))
    .get();
  if (!app || app.app.status === to) return;
  const now = new Date().toISOString();
  db.update(applications).set({ status: to, updatedAt: now }).where(eq(applications.id, applicationId)).run();
  db.insert(applicationStatusHistory)
    .values({ applicationId, fromStatus: app.app.status, toStatus: to, note: opts.note ?? "", userId })
    .run();
  audit(userId, "status_changed", "application", applicationId, `${app.app.status} to ${to}${opts.note ? `: ${opts.note}` : ""}`);
  if (opts.notify !== false && !app.candidate.email.endsWith("@placeholder.local")) {
    sendTemplate(
      "status_changed",
      { email: app.candidate.email, userId: app.candidate.id },
      {
        name: app.candidate.name,
        position: app.position.title,
        app_no: app.app.appNo,
        status: APPLICATION_STATUS[to].label,
        message: opts.message ?? "",
      },
      { applicationId, positionId: app.position.id },
    );
  }
}
