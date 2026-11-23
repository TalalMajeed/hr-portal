import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

const now = () => new Date().toISOString();
const id = () => integer("id").primaryKey({ autoIncrement: true });
const createdAt = () => text("created_at").notNull().$defaultFn(now);

/* ------------------------------------------------------------------ */
/* Shared JSON shapes                                                  */
/* ------------------------------------------------------------------ */

export type Role =
  | "super_admin"
  | "ed"
  | "hr"
  | "hiring_lead"
  | "reviewer"
  | "panel"
  | "board"
  | "agency"
  | "candidate";

export type PositionType = "faculty" | "administrative";

export type ApprovalStatus = "draft" | "hr_review" | "ed_review" | "approved" | "returned";

/** The ten recruitment stages from the SRS workflow. */
export type Stage = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type PositionStatus = "active" | "withdrawn" | "filled" | "on_hold";

export type DocKind = "tor_position" | "tor_committee" | "jd" | "criteria" | "rubric";

export type JdContent = {
  summary: string;
  duties: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  experience: string;
  skills: string[];
  requiredDocuments: string[];
};

export type TorContent = { body: string };

export type CriterionType = "qualification" | "experience" | "cgpa" | "age" | "document" | "custom";

export type Criterion = {
  key: string;
  type: CriterionType;
  label: string;
  /** qualification: minimum degree level (see DEGREE_LEVELS); experience: years; cgpa: number; age: max age; document: doc kind; custom: free text */
  value: string;
  /** qualification only: field(s) of study, comma separated */
  field?: string;
  /** age only: the cut-off date, YYYY-MM-DD */
  cutoffDate?: string;
  mandatory: boolean;
};

export type CriteriaContent = { items: Criterion[] };

export type RoundKind = "shortlisting" | "interview" | "talk" | "second_round";

export type RubricItem = { key: string; label: string; weight: number; maxScore: number; minScore: number };

export type RubricContent = Record<RoundKind, RubricItem[]>;

export type Education = { institution: string; degree: string; level: string; field: string; year: string; grade: string };
export type Experience = { employer: string; designation: string; from: string; to: string; current?: boolean; duties: string };
export type Publication = {
  title: string;
  journal: string;
  year: string;
  status: "published" | "accepted" | "under_review";
  authors: string;
  authorPosition: number;
  articleType: "original_research" | "review" | "book_chapter";
  doi: string;
  quartile: "" | "Q1" | "Q2" | "Q3" | "Q4";
};
export type Reference = { name: string; designation: string; organisation: string; email: string; phone: string };

export type EligibilityItem = { key: string; label: string; mandatory: boolean; met: boolean; note: string };
export type EligibilityResult = { passed: boolean; items: EligibilityItem[]; checkedAt: string };

export type AdvertQuestion = { key: string; label: string; required: boolean };
export type AdvertUpload = { key: string; label: string; required: boolean };

export type ApplicationStatus =
  | "draft"
  | "applied"
  | "under_review"
  | "shortlisted"
  | "interview_scheduled"
  | "talk_scheduled"
  | "selected"
  | "not_selected"
  | "withdrawn";

export type ListStatus = "pending" | "long" | "short" | "reserve" | "not_shortlisted";

export type Scores = Record<string, number>;

export type ProfileSnapshot = {
  name: string;
  email: string;
  phone: string;
  profile: Omit<typeof candidateProfiles.$inferSelect, "id" | "userId" | "updatedAt">;
  documents: { id: number; kind: string; filename: string }[];
};

/* ------------------------------------------------------------------ */
/* Users, auth, audit                                                  */
/* ------------------------------------------------------------------ */

export const users = sqliteTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    passwordHash: text("password_hash"),
    role: text("role").$type<Role>().notNull(),
    designation: text("designation").notNull().default(""),
    organisation: text("organisation").notNull().default(""),
    department: text("department").notNull().default(""),
    discipline: text("discipline").notNull().default(""),
    /** External reviewers and panelists work through a secure link, without a password. */
    external: integer("external", { mode: "boolean" }).notNull().default(false),
    accessToken: text("access_token"),
    emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
    verifyToken: text("verify_token"),
    resetToken: text("reset_token"),
    resetExpires: text("reset_expires"),
    twoFactorEnabled: integer("two_factor_enabled", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email), index("users_role_idx").on(t.role)],
);

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  /** Set while a staff member still has to enter their second-factor code. */
  pendingCode: text("pending_code"),
  createdAt: createdAt(),
});

/** Append-only. Database triggers block UPDATE and DELETE. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: id(),
    userId: integer("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: integer("entity_id"),
    detail: text("detail").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId)],
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/* ------------------------------------------------------------------ */
/* Positions, ToRs, JD, criteria, rubric (A)                           */
/* ------------------------------------------------------------------ */

export const positions = sqliteTable("positions", {
  id: id(),
  code: text("code").notNull().unique(),
  title: text("title").notNull(),
  type: text("type").$type<PositionType>().notNull(),
  department: text("department").notNull(),
  category: text("category").notNull().default(""),
  posts: integer("posts").notNull().default(1),
  grade: text("grade").notNull().default(""),
  reportingLine: text("reporting_line").notNull().default(""),
  budgetLine: text("budget_line").notNull().default(""),
  justification: text("justification").notNull().default(""),
  // Faculty only (A5)
  discipline: text("discipline").notNull().default(""),
  rank: text("rank").notNull().default(""),
  researchArea: text("research_area").notNull().default(""),
  teachingAreas: text("teaching_areas").notNull().default(""),
  approvalStatus: text("approval_status").$type<ApprovalStatus>().notNull().default("draft"),
  stage: integer("stage").$type<Stage>().notNull().default(1),
  status: text("status").$type<PositionStatus>().notNull().default("active"),
  /** C6: block ineligible applications, or let them through flagged. */
  eligibilityMode: text("eligibility_mode").$type<"block" | "flag">().notNull().default("flag"),
  shortlistApproved: integer("shortlist_approved", { mode: "boolean" }).notNull().default(false),
  hiringLeadId: integer("hiring_lead_id").references(() => users.id),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

/** Versioned ToRs, JD, criteria and rubric (A3, A4, A6, A7, A8). The current version is the highest. */
export const positionDocs = sqliteTable(
  "position_docs",
  {
    id: id(),
    positionId: integer("position_id").notNull().references(() => positions.id),
    kind: text("kind").$type<DocKind>().notNull(),
    version: integer("version").notNull(),
    content: text("content", { mode: "json" }).notNull(),
    note: text("note").notNull().default(""),
    createdBy: integer("created_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("position_docs_version_idx").on(t.positionId, t.kind, t.version)],
);

export const jdTemplates = sqliteTable("jd_templates", {
  id: id(),
  name: text("name").notNull(),
  type: text("type").$type<PositionType>().notNull(),
  content: text("content", { mode: "json" }).$type<JdContent>().notNull(),
  createdAt: createdAt(),
});

/** Approvals and sign-offs for positions, adverts, shortlists and panels (A2, D7). */
export const approvals = sqliteTable(
  "approvals",
  {
    id: id(),
    positionId: integer("position_id").notNull().references(() => positions.id),
    subject: text("subject").$type<"position" | "advert" | "shortlist" | "panel">().notNull(),
    action: text("action").notNull(),
    comment: text("comment").notNull().default(""),
    userId: integer("user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("approvals_position_idx").on(t.positionId)],
);

/** Stage changes, extensions, re-advertising and withdrawals (B7, I5). */
export const positionEvents = sqliteTable(
  "position_events",
  {
    id: id(),
    positionId: integer("position_id").notNull().references(() => positions.id),
    type: text("type").notNull(),
    fromStage: integer("from_stage"),
    toStage: integer("to_stage"),
    reason: text("reason").notNull().default(""),
    userId: integer("user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("position_events_position_idx").on(t.positionId)],
);

/* ------------------------------------------------------------------ */
/* Advertisement (B)                                                   */
/* ------------------------------------------------------------------ */

export type AdvertStatus = "draft" | "pending_approval" | "published" | "unpublished" | "closed" | "archived";

export const adverts = sqliteTable("adverts", {
  id: id(),
  positionId: integer("position_id").notNull().unique().references(() => positions.id),
  body: text("body").notNull(),
  status: text("status").$type<AdvertStatus>().notNull().default("draft"),
  closingAt: text("closing_at").notNull(),
  publishedAt: text("published_at"),
  questions: text("questions", { mode: "json" }).$type<AdvertQuestion[]>().notNull().default([]),
  extraUploads: text("extra_uploads", { mode: "json" }).$type<AdvertUpload[]>().notNull().default([]),
  createdAt: createdAt(),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

/** Where and when each ad ran (B5). */
export const advertRuns = sqliteTable("advert_runs", {
  id: id(),
  positionId: integer("position_id").notNull().references(() => positions.id),
  channel: text("channel").notNull(),
  runDate: text("run_date").notNull(),
  notes: text("notes").notNull().default(""),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Candidates and applications (C)                                     */
/* ------------------------------------------------------------------ */

export const candidateProfiles = sqliteTable("candidate_profiles", {
  id: id(),
  userId: integer("user_id").notNull().unique().references(() => users.id),
  cnic: text("cnic").notNull().default(""),
  dateOfBirth: text("date_of_birth").notNull().default(""),
  gender: text("gender").notNull().default(""),
  domicile: text("domicile").notNull().default(""),
  province: text("province").notNull().default(""),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  country: text("country").notNull().default("Pakistan"),
  timezone: text("timezone").notNull().default("Asia/Karachi"),
  education: text("education", { mode: "json" }).$type<Education[]>().notNull().default([]),
  experience: text("experience", { mode: "json" }).$type<Experience[]>().notNull().default([]),
  publications: text("publications", { mode: "json" }).$type<Publication[]>().notNull().default([]),
  references: text("references", { mode: "json" }).$type<Reference[]>().notNull().default([]),
  researchInterests: text("research_interests").notNull().default(""),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

export type DocumentKind =
  | "cv"
  | "degree"
  | "experience_letter"
  | "cnic"
  | "photo"
  | "other"
  | "extra"
  | "slides"
  | "reference_check"
  | "verification"
  | "minutes"
  | "board_attachment";

export const documents = sqliteTable(
  "documents",
  {
    id: id(),
    ownerUserId: integer("owner_user_id").references(() => users.id),
    applicationId: integer("application_id"),
    positionId: integer("position_id"),
    kind: text("kind").$type<DocumentKind>().notNull(),
    label: text("label").notNull().default(""),
    filename: text("filename").notNull(),
    storedName: text("stored_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    scanStatus: text("scan_status").$type<"clean" | "rejected">().notNull().default("clean"),
    uploadedBy: integer("uploaded_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("documents_owner_idx").on(t.ownerUserId), index("documents_application_idx").on(t.applicationId)],
);

export const applications = sqliteTable(
  "applications",
  {
    id: id(),
    appNo: text("app_no").unique(),
    positionId: integer("position_id").notNull().references(() => positions.id),
    candidateId: integer("candidate_id").notNull().references(() => users.id),
    source: text("source").$type<"direct" | "agency" | "referral">().notNull().default("direct"),
    agencyId: integer("agency_id").references(() => users.id),
    status: text("status").$type<ApplicationStatus>().notNull().default("draft"),
    listStatus: text("list_status").$type<ListStatus>().notNull().default("pending"),
    listReason: text("list_reason").notNull().default(""),
    eligibility: text("eligibility", { mode: "json" }).$type<EligibilityResult | null>(),
    eligibilityOverride: text("eligibility_override").$type<"met" | "not_met" | null>(),
    overrideReason: text("override_reason").notNull().default(""),
    /** C3 statements and C5 post-specific answers, keyed by question key. */
    answers: text("answers", { mode: "json" }).$type<Record<string, string>>().notNull().default({}),
    /** C8: the profile as it was at submission. */
    snapshot: text("snapshot", { mode: "json" }).$type<ProfileSnapshot | null>(),
    consent: integer("consent", { mode: "boolean" }).notNull().default(false),
    duplicateOfId: integer("duplicate_of_id"),
    rejectionReason: text("rejection_reason").notNull().default(""),
    shareRejectionReason: integer("share_rejection_reason", { mode: "boolean" }).notNull().default(false),
    submittedAt: text("submitted_at"),
    withdrawnAt: text("withdrawn_at"),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (t) => [
    uniqueIndex("applications_one_per_post_idx").on(t.positionId, t.candidateId),
    index("applications_position_idx").on(t.positionId),
  ],
);

export const applicationStatusHistory = sqliteTable(
  "application_status_history",
  {
    id: id(),
    applicationId: integer("application_id").notNull().references(() => applications.id),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    note: text("note").notNull().default(""),
    userId: integer("user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("status_history_application_idx").on(t.applicationId)],
);

/** D6: never shown to the candidate. */
export const applicationNotes = sqliteTable("application_notes", {
  id: id(),
  applicationId: integer("application_id").notNull().references(() => applications.id),
  userId: integer("user_id").notNull().references(() => users.id),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

/** C9: documents HR asks for after submission. */
export const documentRequests = sqliteTable("document_requests", {
  id: id(),
  applicationId: integer("application_id").notNull().references(() => applications.id),
  label: text("label").notNull(),
  status: text("status").$type<"open" | "fulfilled">().notNull().default("open"),
  documentId: integer("document_id"),
  createdAt: createdAt(),
});

/* ------------------------------------------------------------------ */
/* Shortlisting (D)                                                    */
/* ------------------------------------------------------------------ */

export const reviewAssignments = sqliteTable(
  "review_assignments",
  {
    id: id(),
    applicationId: integer("application_id").notNull().references(() => applications.id),
    reviewerId: integer("reviewer_id").notNull().references(() => users.id),
    scores: text("scores", { mode: "json" }).$type<Scores>().notNull().default({}),
    remarks: text("remarks").notNull().default(""),
    submittedAt: text("submitted_at"),
    assignedBy: integer("assigned_by").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("review_assignments_unique_idx").on(t.applicationId, t.reviewerId)],
);

/* ------------------------------------------------------------------ */
/* Panels (E)                                                          */
/* ------------------------------------------------------------------ */

export type PanelRound = "interview" | "talk" | "second_round";

export const panels = sqliteTable("panels", {
  id: id(),
  positionId: integer("position_id").notNull().references(() => positions.id),
  round: text("round").$type<PanelRound>().notNull(),
  name: text("name").notNull().default(""),
  status: text("status").$type<"draft" | "pending_approval" | "approved">().notNull().default("draft"),
  createdAt: createdAt(),
});

export const panelMembers = sqliteTable(
  "panel_members",
  {
    id: id(),
    panelId: integer("panel_id").notNull().references(() => panels.id),
    userId: integer("user_id").notNull().references(() => users.id),
    isChair: integer("is_chair", { mode: "boolean" }).notNull().default(false),
    inviteStatus: text("invite_status").$type<"not_sent" | "pending" | "accepted" | "declined" | "replaced">().notNull().default("not_sent"),
    invitedAt: text("invited_at"),
    respondedAt: text("responded_at"),
    declineReason: text("decline_reason").notNull().default(""),
    replacedById: integer("replaced_by_id"),
    replaceReason: text("replace_reason").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("panel_members_unique_idx").on(t.panelId, t.userId)],
);

/** E4: candidate slots offered to the panel for the availability poll. Times are UTC ISO. */
export const panelSlots = sqliteTable("panel_slots", {
  id: id(),
  panelId: integer("panel_id").notNull().references(() => panels.id),
  startsAt: text("starts_at").notNull(),
  durationMin: integer("duration_min").notNull().default(45),
});

export const panelAvailability = sqliteTable(
  "panel_availability",
  {
    id: id(),
    slotId: integer("slot_id").notNull().references(() => panelSlots.id),
    userId: integer("user_id").notNull().references(() => users.id),
    available: integer("available", { mode: "boolean" }).notNull(),
  },
  (t) => [uniqueIndex("panel_availability_unique_idx").on(t.slotId, t.userId)],
);

/** E5: one declaration per panel member per candidate. */
export const conflicts = sqliteTable(
  "conflicts",
  {
    id: id(),
    panelId: integer("panel_id").notNull().references(() => panels.id),
    userId: integer("user_id").notNull().references(() => users.id),
    applicationId: integer("application_id").notNull().references(() => applications.id),
    hasConflict: integer("has_conflict", { mode: "boolean" }).notNull(),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("conflicts_unique_idx").on(t.panelId, t.userId, t.applicationId)],
);

/* ------------------------------------------------------------------ */
/* Scheduling (F)                                                      */
/* ------------------------------------------------------------------ */

export type EventStatus = "invited" | "confirmed" | "declined" | "reschedule_requested" | "cancelled" | "completed";

export const events = sqliteTable(
  "events",
  {
    id: id(),
    positionId: integer("position_id").notNull().references(() => positions.id),
    panelId: integer("panel_id").references(() => panels.id),
    applicationId: integer("application_id").notNull().references(() => applications.id),
    round: text("round").$type<PanelRound>().notNull(),
    startsAt: text("starts_at").notNull(),
    durationMin: integer("duration_min").notNull().default(45),
    mode: text("mode").$type<"online" | "in_person">().notNull().default("online"),
    venue: text("venue").notNull().default(""),
    meetingProvider: text("meeting_provider").$type<"zoom" | "meet" | "teams" | "">().notNull().default(""),
    meetingUrl: text("meeting_url").notNull().default(""),
    meetingId: text("meeting_id").notNull().default(""),
    passcode: text("passcode").notNull().default(""),
    waitingRoom: integer("waiting_room", { mode: "boolean" }).notNull().default(true),
    prepNote: text("prep_note").notNull().default(""),
    // F7 faculty talk
    topic: text("topic").notNull().default(""),
    audience: text("audience").notNull().default(""),
    // F8 second round
    brief: text("brief").notNull().default(""),
    status: text("status").$type<EventStatus>().notNull().default("invited"),
    candidateNote: text("candidate_note").notNull().default(""),
    reminders: text("reminders", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("events_starts_idx").on(t.startsAt), index("events_position_idx").on(t.positionId)],
);

/* ------------------------------------------------------------------ */
/* Evaluation (G)                                                      */
/* ------------------------------------------------------------------ */

export type Recommendation = "recommend" | "recommend_with_reservation" | "not_recommend";

export const evaluations = sqliteTable(
  "evaluations",
  {
    id: id(),
    eventId: integer("event_id").notNull().references(() => events.id),
    applicationId: integer("application_id").notNull().references(() => applications.id),
    panelistId: integer("panelist_id").notNull().references(() => users.id),
    round: text("round").$type<PanelRound>().notNull(),
    scores: text("scores", { mode: "json" }).$type<Scores>().notNull().default({}),
    strengths: text("strengths").notNull().default(""),
    concerns: text("concerns").notNull().default(""),
    recommendation: text("recommendation").$type<Recommendation | "">().notNull().default(""),
    status: text("status").$type<"draft" | "submitted" | "reopened">().notNull().default("draft"),
    submittedAt: text("submitted_at"),
    reopenReason: text("reopen_reason").notNull().default(""),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("evaluations_unique_idx").on(t.eventId, t.panelistId)],
);

/** G6: panel consensus and the chair's ranked recommendation. */
export const consensus = sqliteTable(
  "consensus",
  {
    id: id(),
    positionId: integer("position_id").notNull().references(() => positions.id),
    round: text("round").$type<PanelRound>().notNull(),
    note: text("note").notNull().default(""),
    ranking: text("ranking", { mode: "json" }).$type<number[]>().notNull().default([]),
    chairId: integer("chair_id").references(() => users.id),
    signedOffAt: text("signed_off_at"),
    updatedAt: text("updated_at").notNull().$defaultFn(now),
  },
  (t) => [uniqueIndex("consensus_unique_idx").on(t.positionId, t.round)],
);

/* ------------------------------------------------------------------ */
/* Selection Board and offers (H)                                      */
/* ------------------------------------------------------------------ */

export const boards = sqliteTable("boards", {
  id: id(),
  positionId: integer("position_id").notNull().unique().references(() => positions.id),
  meetingDate: text("meeting_date").notNull().default(""),
  proposedSalary: text("proposed_salary").notNull().default(""),
  terms: text("terms").notNull().default(""),
  minutes: text("minutes").notNull().default(""),
  packGeneratedAt: text("pack_generated_at"),
  edSignedOffAt: text("ed_signed_off_at"),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

export const boardDecisions = sqliteTable(
  "board_decisions",
  {
    id: id(),
    positionId: integer("position_id").notNull().references(() => positions.id),
    applicationId: integer("application_id").notNull().references(() => applications.id),
    decision: text("decision").$type<"recommended" | "not_recommended" | "deferred">().notNull(),
    rank: integer("rank"),
    notes: text("notes").notNull().default(""),
    userId: integer("user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("board_decisions_unique_idx").on(t.positionId, t.applicationId)],
);

export const offers = sqliteTable("offers", {
  id: id(),
  applicationId: integer("application_id").notNull().unique().references(() => applications.id),
  positionId: integer("position_id").notNull().references(() => positions.id),
  salary: text("salary").notNull().default(""),
  body: text("body").notNull(),
  status: text("status").$type<"sent" | "accepted" | "declined" | "withdrawn">().notNull().default("sent"),
  sentAt: text("sent_at").notNull().$defaultFn(now),
  respondedAt: text("responded_at"),
  joinedAt: text("joined_at"),
});

/* ------------------------------------------------------------------ */
/* Email                                                               */
/* ------------------------------------------------------------------ */

export const emailTemplates = sqliteTable("email_templates", {
  key: text("key").primaryKey(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  updatedAt: text("updated_at").notNull().$defaultFn(now),
});

/** Every email the system sends, kept as a copy in the record. */
export const emails = sqliteTable(
  "emails",
  {
    id: id(),
    toEmail: text("to_email").notNull(),
    toUserId: integer("to_user_id"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    templateKey: text("template_key").notNull().default(""),
    applicationId: integer("application_id"),
    positionId: integer("position_id"),
    attachments: text("attachments", { mode: "json" }).$type<{ name: string; url: string }[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [index("emails_user_idx").on(t.toUserId)],
);
