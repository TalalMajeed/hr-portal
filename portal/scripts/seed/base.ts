import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, schema, daysAgo, daysAhead } from "./db";
import { EMAIL_TEMPLATES, JD_TEMPLATES } from "./templates";
import { checkEligibility } from "../../src/lib/eligibility";
import type {
  ApplicationStatus,
  CriteriaContent,
  Education,
  Experience,
  JdContent,
  ListStatus,
  Publication,
  Reference,
  Role,
  RubricContent,
} from "../../src/lib/db/schema";

const {
  users,
  candidateProfiles,
  positions,
  positionDocs,
  approvals,
  positionEvents,
  adverts,
  advertRuns,
  applications,
  applicationStatusHistory,
  documents,
  emailTemplates,
  jdTemplates,
  settings,
  emails,
} = schema;

const PASSWORD = bcrypt.hashSync("Demo@1234", 10);
const UPLOAD_DIR = path.resolve("data/uploads");

/* ------------------------------------------------------------------ */

function user(name: string, email: string, role: Role, extra: Partial<typeof users.$inferInsert> = {}) {
  return db
    .insert(users)
    .values({ name, email, role, passwordHash: extra.external ? null : PASSWORD, emailVerified: true, createdAt: daysAgo(120), ...extra })
    .returning()
    .get();
}

/** A tiny but valid one-page PDF so seeded documents open. */
function pdf(title: string) {
  const text = title.replace(/[()\\]/g, "");
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

export function seedDocument(meta: { ownerUserId: number | null; kind: typeof documents.$inferInsert.kind; filename: string; title: string; applicationId?: number; positionId?: number; uploadedBy?: number; label?: string }) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const buf = pdf(meta.title);
  const storedName = `${randomBytes(16).toString("hex")}.pdf`;
  fs.writeFileSync(path.join(UPLOAD_DIR, storedName), buf);
  return db
    .insert(documents)
    .values({
      ownerUserId: meta.ownerUserId,
      applicationId: meta.applicationId ?? null,
      positionId: meta.positionId ?? null,
      kind: meta.kind,
      label: meta.label ?? "",
      filename: meta.filename,
      storedName,
      mime: "application/pdf",
      size: buf.length,
      uploadedBy: meta.uploadedBy ?? meta.ownerUserId,
      createdAt: daysAgo(60),
    })
    .returning()
    .get();
}

type CandidateSeed = {
  name: string;
  email: string;
  phone: string;
  gender: string;
  dob: string;
  cnic: string;
  domicile: string;
  province: string;
  city: string;
  country?: string;
  timezone?: string;
  education: Education[];
  experience: Experience[];
  publications?: Publication[];
  references?: Reference[];
  research?: string;
  placeholder?: boolean;
};

function candidate(c: CandidateSeed) {
  const u = user(c.name, c.email, "candidate", {
    phone: c.phone,
    passwordHash: c.placeholder ? null : PASSWORD,
    emailVerified: !c.placeholder,
  });
  db.insert(candidateProfiles)
    .values({
      userId: u.id,
      cnic: c.cnic,
      dateOfBirth: c.dob,
      gender: c.gender,
      domicile: c.domicile,
      province: c.province,
      city: c.city,
      address: `${c.city}`,
      country: c.country ?? "Pakistan",
      timezone: c.timezone ?? "Asia/Karachi",
      education: c.education,
      experience: c.experience,
      publications: c.publications ?? [],
      references: c.references ?? [
        { name: "Dr. Kamal Hassan", designation: "Professor", organisation: "NUST", email: "kamal.hassan@example.com", phone: "+92 51 111 000 111" },
      ],
      researchInterests: c.research ?? "",
    })
    .run();
  for (const [kind, label] of [
    ["cv", "CV"],
    ["degree", "Highest degree"],
    ["cnic", "CNIC"],
  ] as const) {
    seedDocument({ ownerUserId: u.id, kind, filename: `${c.name.split(" ")[0]}-${kind}.pdf`, title: `${c.name}: ${label}` });
  }
  if (c.experience.length) seedDocument({ ownerUserId: u.id, kind: "experience_letter", filename: `${c.name.split(" ")[0]}-experience.pdf`, title: `${c.name}: experience letter` });
  return u;
}

const phd = (field: string, inst: string, year: string, grade = "3.7/4"): Education => ({ institution: inst, degree: `PhD ${field}`, level: "6", field, year, grade });
const ms = (field: string, inst: string, year: string, grade = "3.6/4"): Education => ({ institution: inst, degree: `MS ${field}`, level: "5", field, year, grade });
const bs = (field: string, inst: string, year: string, grade = "3.4/4"): Education => ({ institution: inst, degree: `BS ${field}`, level: "4", field, year, grade });
const job = (employer: string, designation: string, from: string, to: string, duties: string, current = false): Experience => ({ employer, designation, from, to, duties, current });
const pub = (title: string, journal: string, year: string, authors: string, authorPosition: number, quartile: Publication["quartile"], status: Publication["status"] = "published"): Publication => ({
  title,
  journal,
  year,
  status,
  authors,
  authorPosition,
  articleType: "original_research",
  doi: `10.1000/du.${year}.${Math.floor(Math.random() * 9000 + 1000)}`,
  quartile,
});

/* ------------------------------------------------------------------ */

const rubric = (faculty: boolean): RubricContent => ({
  shortlisting: faculty
    ? [
        { key: "qualifications", label: "Qualifications", weight: 30, maxScore: 10, minScore: 5 },
        { key: "experience", label: "Teaching and work experience", weight: 25, maxScore: 10, minScore: 4 },
        { key: "research", label: "Research and publications", weight: 30, maxScore: 10, minScore: 4 },
        { key: "fit", label: "Fit with the department", weight: 15, maxScore: 10, minScore: 0 },
      ]
    : [
        { key: "qualifications", label: "Qualifications", weight: 30, maxScore: 10, minScore: 5 },
        { key: "experience", label: "Relevant experience", weight: 45, maxScore: 10, minScore: 5 },
        { key: "fit", label: "Fit with the role", weight: 25, maxScore: 10, minScore: 0 },
      ],
  interview: faculty
    ? [
        { key: "knowledge", label: "Subject knowledge", weight: 30, maxScore: 10, minScore: 5 },
        { key: "teaching", label: "Teaching approach", weight: 25, maxScore: 10, minScore: 4 },
        { key: "research_vision", label: "Research vision", weight: 25, maxScore: 10, minScore: 4 },
        { key: "communication", label: "Communication", weight: 20, maxScore: 10, minScore: 4 },
      ]
    : [
        { key: "knowledge", label: "Professional knowledge", weight: 35, maxScore: 10, minScore: 5 },
        { key: "leadership", label: "Leadership", weight: 25, maxScore: 10, minScore: 4 },
        { key: "judgement", label: "Judgement and problem solving", weight: 25, maxScore: 10, minScore: 4 },
        { key: "communication", label: "Communication", weight: 15, maxScore: 10, minScore: 4 },
      ],
  talk: [
    { key: "content", label: "Content and depth", weight: 40, maxScore: 10, minScore: 5 },
    { key: "delivery", label: "Delivery and clarity", weight: 30, maxScore: 10, minScore: 4 },
    { key: "qa", label: "Handling questions", weight: 30, maxScore: 10, minScore: 4 },
  ],
  second_round: [
    { key: "plan", label: "Quality of the plan", weight: 50, maxScore: 10, minScore: 5 },
    { key: "presentation", label: "Presentation", weight: 25, maxScore: 10, minScore: 4 },
    { key: "qa", label: "Handling questions", weight: 25, maxScore: 10, minScore: 4 },
  ],
});

type PositionSeed = {
  title: string;
  type: "faculty" | "administrative";
  department: string;
  category: string;
  grade: string;
  posts?: number;
  reportingLine: string;
  budgetLine: string;
  justification: string;
  discipline?: string;
  rank?: string;
  researchArea?: string;
  teachingAreas?: string;
  hiringLeadId: number;
  createdBy: number;
  stage: number;
  approval: "draft" | "hr_review" | "ed_review" | "approved";
  status?: "active" | "filled";
  createdDaysAgo: number;
  /** days ago each stage was entered, index 0 = stage 1 */
  stageDays: number[];
  jd: JdContent;
  criteria: CriteriaContent;
  advert?: { status: "published" | "closed" | "draft"; publishedDaysAgo: number; closingDays: number };
};

let positionCount = 0;

function position(p: PositionSeed, actors: { hr: number; ed: number }) {
  positionCount += 1;
  const code = `DU-2026-${String(positionCount).padStart(3, "0")}`;
  const row = db
    .insert(positions)
    .values({
      code,
      title: p.title,
      type: p.type,
      department: p.department,
      category: p.category,
      posts: p.posts ?? 1,
      grade: p.grade,
      reportingLine: p.reportingLine,
      budgetLine: p.budgetLine,
      justification: p.justification,
      discipline: p.discipline ?? "",
      rank: p.rank ?? "",
      researchArea: p.researchArea ?? "",
      teachingAreas: p.teachingAreas ?? "",
      approvalStatus: p.approval,
      stage: p.stage as 1,
      status: p.status ?? "active",
      eligibilityMode: "flag",
      shortlistApproved: p.stage >= 6,
      hiringLeadId: p.hiringLeadId,
      createdBy: p.createdBy,
      createdAt: daysAgo(p.createdDaysAgo),
      updatedAt: daysAgo(Math.max(0, p.stageDays[p.stageDays.length - 1] ?? 0)),
    })
    .returning()
    .get();

  const t0 = p.createdDaysAgo;
  const doc = (kind: "tor_position" | "tor_committee" | "jd" | "criteria" | "rubric", content: unknown, version = 1, note = "", by = p.createdBy, at = t0 - 1) =>
    db.insert(positionDocs).values({ positionId: row.id, kind, version, content, note, createdBy: by, createdAt: daysAgo(at) }).run();

  doc("tor_position", {
    body: `The ${p.title} reports to the ${p.reportingLine}. The post holder is responsible for the ${p.department} function as set out in the job description, works within DU policies, and is reviewed annually against agreed objectives.`,
  });
  doc("tor_committee", {
    body: `The selection committee for ${p.title} shortlists against the published criteria, interviews shortlisted candidates using the agreed rubric, declares any conflict of interest before reviewing a candidate, and gives the Selection Board a ranked recommendation with reasons.`,
  });
  doc("jd", { ...p.jd, summary: p.jd.summary.replace("{{title}}", p.title) }, 1, "First draft", p.hiringLeadId, t0 - 1);
  doc("jd", p.jd, 2, "HR edits to duties", actors.hr, t0 - 2);
  doc("criteria", p.criteria);
  doc("rubric", rubric(p.type === "faculty"));

  // A2 approval trail
  const trail: [string, string, number, number][] = [["submitted", "Drafted and sent to HR", p.hiringLeadId, t0]];
  if (["ed_review", "approved"].includes(p.approval)) trail.push(["hr_reviewed", "Budget line confirmed. Sent to ED.", actors.hr, t0 - 2]);
  if (p.approval === "approved") trail.push(["ed_approved", "Approved.", actors.ed, t0 - 3]);
  for (const [action, comment, userId, at] of trail) {
    db.insert(approvals).values({ positionId: row.id, subject: "position", action, comment, userId, createdAt: daysAgo(at) }).run();
  }

  // I5 stage timeline
  p.stageDays.forEach((d, i) => {
    if (i === 0) return;
    db.insert(positionEvents).values({ positionId: row.id, type: "stage_changed", fromStage: i, toStage: i + 1, userId: actors.hr, createdAt: daysAgo(d) }).run();
  });

  if (p.advert) {
    const jd = p.jd;
    db.insert(adverts)
      .values({
        positionId: row.id,
        body: `Daanish University invites applications for the post of ${p.title} (${p.department}, ${p.grade}).\n\n${jd.summary}\n\nDuties include: ${jd.duties.slice(0, 3).join("; ")}.\n\nRequired: ${jd.requiredQualifications.join("; ")}. ${jd.experience}\n\nApply online at careers.du.edu.pk before the closing date.`,
        status: p.advert.status,
        publishedAt: p.advert.status === "draft" ? null : daysAgo(p.advert.publishedDaysAgo),
        closingAt: daysAhead(p.advert.closingDays, 23),
        questions:
          p.type === "faculty"
            ? [{ key: "q_start", label: "When could you join if selected?", required: true }]
            : [{ key: "q_notice", label: "What is your notice period?", required: true }],
        extraUploads: [],
        createdAt: daysAgo(p.advert.publishedDaysAgo + 1),
      })
      .run();
    db.insert(approvals).values({ positionId: row.id, subject: "advert", action: "ed_approved", comment: "Ad approved for publishing.", userId: actors.ed, createdAt: daysAgo(p.advert.publishedDaysAgo) }).run();
    if (p.advert.status !== "draft") {
      for (const channel of ["DU careers page", "Dawn", "LinkedIn"]) {
        db.insert(advertRuns).values({ positionId: row.id, channel, runDate: daysAgo(p.advert.publishedDaysAgo).slice(0, 10), notes: channel === "Dawn" ? "Sunday classifieds, page 14" : "", createdBy: actors.hr }).run();
      }
    }
  }
  return row;
}

/* ------------------------------------------------------------------ */

type AppSeed = {
  status: ApplicationStatus;
  list?: ListStatus;
  listReason?: string;
  daysAgo: number;
  source?: "direct" | "agency" | "referral";
  agencyId?: number;
  history?: [ApplicationStatus, number][];
  answers?: Record<string, string>;
};

const appCounters: Record<number, number> = {};

export function application(pos: typeof positions.$inferSelect, cand: typeof users.$inferSelect, a: AppSeed, actor: number) {
  const profile = db.select().from(candidateProfiles).where(eq(candidateProfiles.userId, cand.id)).get()!;
  const docs = db.select().from(documents).where(eq(documents.ownerUserId, cand.id)).all();
  const criteria = db.select().from(positionDocs).where(eq(positionDocs.positionId, pos.id)).all().filter((d) => d.kind === "criteria").pop()!.content as CriteriaContent;
  const eligibility = checkEligibility(criteria, profile, docs.map((d) => d.kind));
  eligibility.checkedAt = daysAgo(a.daysAgo);
  appCounters[pos.id] = (appCounters[pos.id] ?? 0) + 1;
  const { id: _i, userId: _u, updatedAt: _t, ...frozen } = profile;
  void _i;
  void _u;
  void _t;
  const row = db
    .insert(applications)
    .values({
      appNo: `${pos.code}-${String(appCounters[pos.id]).padStart(4, "0")}`,
      positionId: pos.id,
      candidateId: cand.id,
      source: a.source ?? "direct",
      agencyId: a.agencyId ?? null,
      status: a.status,
      listStatus: a.list ?? "pending",
      listReason: a.listReason ?? "",
      eligibility,
      answers: a.answers ?? (pos.type === "faculty"
        ? {
            letter_of_interest: `I am applying for ${pos.title} because DU's founding mission matches my plans to build a research group and teach at undergraduate level.`,
            teaching_statement: "I teach through problems first and theory second, with weekly feedback and open office hours.",
            research_statement: "My research builds methods that are both rigorous and useful in Pakistan's context, with students as co-authors.",
            q_start: "Within two months of an offer",
          }
        : { q_notice: "One month" }),
      snapshot: {
        name: cand.name,
        email: cand.email,
        phone: cand.phone,
        profile: frozen,
        documents: docs.map((d) => ({ id: d.id, kind: d.kind, filename: d.filename })),
      },
      consent: true,
      submittedAt: daysAgo(a.daysAgo),
      createdAt: daysAgo(a.daysAgo + 1),
      updatedAt: daysAgo(Math.max(0, a.daysAgo - 5)),
    })
    .returning()
    .get();
  const history = a.history ?? [["applied", a.daysAgo]];
  let prev: ApplicationStatus | null = null;
  for (const [s, d] of history) {
    db.insert(applicationStatusHistory).values({ applicationId: row.id, fromStatus: prev, toStatus: s, userId: s === "applied" ? cand.id : actor, createdAt: daysAgo(d) }).run();
    prev = s;
  }
  if (!cand.email.endsWith("@placeholder.local")) {
    db.insert(emails)
      .values({
        toEmail: cand.email,
        toUserId: cand.id,
        subject: `Application received: ${pos.title} (${row.appNo})`,
        body: `Dear ${cand.name},\n\nWe have received your application for ${pos.title}.\n\nApplication number: ${row.appNo}\n\nDU Human Resources`,
        templateKey: "application_received",
        applicationId: row.id,
        positionId: pos.id,
        createdAt: daysAgo(a.daysAgo),
      })
      .run();
  }
  return row;
}

/* ------------------------------------------------------------------ */

export function seedBase() {
  db.insert(settings)
    .values([
      { key: "max_upload_mb", value: "5" },
      { key: "org_name", value: "Daanish University" },
      { key: "from_address", value: "careers@du.edu.pk" },
      { key: "retention_months", value: "24" },
    ])
    .run();
  db.insert(emailTemplates).values(EMAIL_TEMPLATES).run();
  db.insert(jdTemplates).values(JD_TEMPLATES).run();

  /* Staff and externals --------------------------------------------- */
  const admin = user("Faisal Rehman", "admin@demo.du.edu.pk", "super_admin", { designation: "IT Manager", organisation: "Daanish University", department: "Information Technology" });
  const ed = user("Dr. Sadia Nawaz", "ed@demo.du.edu.pk", "ed", { designation: "Executive Director", organisation: "Daanish University" });
  const hr = user("Azhar Mahmood", "azhar.hr@demo.du.edu.pk", "hr", { designation: "Manager Recruitment", organisation: "Daanish University", department: "Human Resources" });
  const hr2 = user("Shumaila Akram", "shumaila.hr@demo.du.edu.pk", "hr", { designation: "Recruitment Officer", organisation: "Daanish University", department: "Human Resources" });
  const deanSci = user("Dr. Arif Hussain", "dean.science@demo.du.edu.pk", "hiring_lead", { designation: "Dean of Sciences", organisation: "Daanish University", department: "Physics", discipline: "Physics" });
  const deanComp = user("Dr. Mehwish Siddiqui", "dean.computing@demo.du.edu.pk", "hiring_lead", { designation: "Dean of Computing", organisation: "Daanish University", department: "Computer Science", discipline: "Computer Science" });
  const headFin = user("Naveed Anjum", "head.finance@demo.du.edu.pk", "hiring_lead", { designation: "Director Finance (acting)", organisation: "Daanish University", department: "Finance" });

  const revInt = user("Dr. Imran Qadir", "reviewer@demo.du.edu.pk", "reviewer", { designation: "Associate Professor", organisation: "Daanish University", discipline: "Computer Science" });
  const revExt = user("Prof. Lubna Shah", "reviewer.ext@example.com", "reviewer", {
    designation: "Professor of Computer Science",
    organisation: "LUMS",
    discipline: "Computer Science",
    external: true,
    accessToken: "demo-reviewer-link-0f6c2a9d8e7b4a31",
  });

  const panelChair = user("Prof. Zafar Iqbal", "panel.chair@demo.du.edu.pk", "panel", { designation: "Professor of Computer Science", organisation: "Daanish University", discipline: "Computer Science", phone: "+92 51 900 1001" });
  const panelA = user("Dr. Farah Javed", "farah.javed@demo.du.edu.pk", "panel", { designation: "Associate Professor", organisation: "Daanish University", discipline: "Computer Science", phone: "+92 51 900 1002" });
  const panelB = user("Dr. Kashif Raza", "kashif.raza@example.com", "panel", {
    designation: "Professor",
    organisation: "NUST",
    discipline: "Computer Science",
    external: true,
    accessToken: "demo-panel-link-9a1b7c3d5e2f4a60",
    phone: "+92 51 111 222 333",
  });
  const panelC = user("Dr. Amna Tariq", "amna.tariq@example.com", "panel", {
    designation: "Associate Professor",
    organisation: "Quaid-i-Azam University",
    discipline: "Physics",
    external: true,
    accessToken: "demo-panel-link-4c8e1f2a7b9d3e51",
    phone: "+92 51 444 555 666",
  });
  const panelD = user("Saima Ashraf", "saima.ashraf@demo.du.edu.pk", "panel", { designation: "Director Administration", organisation: "Daanish University", discipline: "Administration", phone: "+92 51 900 1005" });

  const boardChair = user("Justice (R) Kamran Ali", "board.chair@demo.du.edu.pk", "board", { designation: "Chairperson, Selection Board", organisation: "Daanish University" });
  const boardMember = user("Dr. Nighat Parveen", "board.member@demo.du.edu.pk", "board", { designation: "Member, Selection Board", organisation: "Higher Education Commission" });

  const agency = user("Career Pakistan", "careerpakistan@example.com", "agency", { designation: "Executive search", organisation: "Career Pakistan", phone: "+92 42 3577 0000" });

  /* Candidates ------------------------------------------------------- */
  const ayesha = candidate({
    name: "Ayesha Khan",
    email: "ayesha.khan@example.com",
    phone: "+92 300 5551234",
    gender: "Female",
    dob: "1990-04-12",
    cnic: "61101-1234567-2",
    domicile: "Islamabad",
    province: "Islamabad Capital Territory",
    city: "Islamabad",
    education: [phd("Computer Science", "University of Edinburgh", "2019", "Pass"), ms("Computer Science", "NUST", "2014"), bs("Computer Science", "FAST NUCES", "2012", "3.6/4")],
    experience: [job("COMSATS University Islamabad", "Assistant Professor", "2019-09-01", "", "Taught machine learning and data structures; led a three-person research group.", true)],
    publications: [
      pub("Fair ranking under uncertainty", "IEEE Transactions on Knowledge and Data Engineering", "2023", "A. Khan; R. Malik; J. Smith", 1, "Q1"),
      pub("Low-resource Urdu text classification", "Information Processing and Management", "2022", "S. Ahmed; A. Khan", 2, "Q1"),
      pub("Graph learning for school placement", "Pattern Recognition Letters", "2025", "A. Khan; H. Ali", 1, "Q2", "accepted"),
    ],
    research: "Machine learning, fairness, natural language processing for Urdu",
  });
  const bilal = candidate({
    name: "Bilal Ahmed",
    email: "bilal.ahmed@example.com",
    phone: "+1 206 555 0147",
    gender: "Male",
    dob: "1987-11-03",
    cnic: "35202-7654321-1",
    domicile: "Lahore",
    province: "Outside Pakistan",
    city: "Seattle",
    country: "United States",
    timezone: "America/Los_Angeles",
    education: [phd("Computer Science", "University of Washington", "2017"), bs("Computer Science", "LUMS", "2010", "3.7/4")],
    experience: [
      job("University of Washington", "Postdoctoral Researcher", "2017-07-01", "2020-06-30", "Systems research on distributed databases."),
      job("Amazon Web Services", "Senior Research Scientist", "2020-07-01", "", "Research on cloud storage reliability.", true),
    ],
    publications: [pub("Consistent snapshots at cloud scale", "ACM Transactions on Database Systems", "2021", "B. Ahmed; K. Lee; M. Stone", 1, "Q1")],
    research: "Distributed systems, databases",
  });
  const sana = candidate({
    name: "Sana Iqbal",
    email: "sana.iqbal@example.com",
    phone: "+92 321 4440987",
    gender: "Female",
    dob: "1989-02-20",
    cnic: "35201-2223334-6",
    domicile: "Lahore",
    province: "Punjab",
    city: "Lahore",
    education: [phd("Computer Science", "LUMS", "2018"), ms("Computer Science", "UET Lahore", "2013")],
    experience: [job("University of the Punjab", "Assistant Professor", "2018-09-01", "", "Software engineering courses; industry projects.", true)],
    publications: [pub("Test prioritisation with code embeddings", "Empirical Software Engineering", "2022", "M. Raza; S. Iqbal", 2, "Q1")],
    research: "Software engineering, program analysis",
  });
  const usman = candidate({
    name: "Usman Tariq",
    email: "usman.tariq@example.com",
    phone: "+92 333 2220011",
    gender: "Male",
    dob: "1985-08-14",
    cnic: "42101-5556667-9",
    domicile: "Karachi",
    province: "Sindh",
    city: "Karachi",
    education: [phd("Computer Engineering", "NED University", "2016", "3.4/4"), ms("Computer Engineering", "NED University", "2011")],
    experience: [job("Habib University", "Assistant Professor", "2016-08-01", "", "Embedded systems and IoT.", true)],
    publications: [pub("Energy-aware scheduling for sensor networks", "IEEE Sensors Journal", "2020", "U. Tariq; F. Shah", 1, "Q2")],
    research: "Embedded systems, IoT",
  });
  const hamza = candidate({
    name: "Hamza Ali",
    email: "hamza.ali@example.com",
    phone: "+92 345 8889990",
    gender: "Male",
    dob: "1994-06-30",
    cnic: "37405-1112223-5",
    domicile: "Rawalpindi",
    province: "Punjab",
    city: "Rawalpindi",
    education: [ms("Computer Science", "COMSATS", "2019", "3.2/4"), bs("Computer Science", "Arid University", "2016", "3.0/4")],
    experience: [job("Systems Ltd", "Software Engineer", "2019-07-01", "", "Backend services.", true)],
  });
  const fatima = candidate({
    name: "Fatima Noor",
    email: "fatima.noor@example.com",
    phone: "+92 301 1212121",
    gender: "Female",
    dob: "1988-01-09",
    cnic: "17301-9998887-4",
    domicile: "Peshawar",
    province: "Khyber Pakhtunkhwa",
    city: "Peshawar",
    education: [phd("Computer Science", "University of Peshawar", "2020", "3.5/4")],
    experience: [job("University of Peshawar", "Lecturer", "2015-09-01", "", "Teaching databases and networks.", true)],
    publications: [pub("Intrusion detection with federated learning", "Computers and Security", "2023", "F. Noor; A. Khan", 1, "Q1")],
  });
  const imran = candidate({
    name: "Imran Shah",
    email: "imran.shah@example.com",
    phone: "+92 300 7778889",
    gender: "Male",
    dob: "1983-03-25",
    cnic: "61101-4445556-7",
    domicile: "Islamabad",
    province: "Islamabad Capital Territory",
    city: "Islamabad",
    education: [ms("Supply Chain Management", "NUST", "2009", "3.3/4"), bs("Business Administration", "IIUI", "2006")],
    experience: [
      job("PTCL", "Assistant Manager Procurement", "2009-08-01", "2015-12-31", "Tenders and vendor management."),
      job("COMSATS University Islamabad", "Deputy Manager Procurement", "2016-01-01", "", "PPRA-compliant procurement for a university.", true),
    ],
  });
  const zainab = candidate({
    name: "Zainab Raza",
    email: "zainab.raza@example.com",
    phone: "+92 322 6665554",
    gender: "Female",
    dob: "1990-12-01",
    cnic: "35202-3334445-8",
    domicile: "Lahore",
    province: "Punjab",
    city: "Lahore",
    education: [ms("Business Administration", "LUMS", "2014", "3.5/4")],
    experience: [job("Unilever Pakistan", "Procurement Officer", "2014-07-01", "", "Indirect procurement.", true)],
  });
  const nadia = candidate({
    name: "Nadia Hussain",
    email: "nadia.hussain@example.com",
    phone: "+92 312 4545454",
    gender: "Female",
    dob: "1986-05-17",
    cnic: "37405-6667778-2",
    domicile: "Rawalpindi",
    province: "Punjab",
    city: "Rawalpindi",
    education: [ms("Public Administration", "Fatima Jinnah Women University", "2010", "3.4/4")],
    experience: [job("Pakistan Railways", "Procurement Officer", "2011-01-01", "", "Public procurement under PPRA.", true)],
  });
  const kamran = candidate({
    name: "Kamran Akhtar",
    email: "kamran.akhtar@placeholder.local",
    phone: "+92 300 1110001",
    gender: "Male",
    dob: "1982-09-09",
    cnic: "61101-2020202-1",
    domicile: "Islamabad",
    province: "Islamabad Capital Territory",
    city: "Islamabad",
    education: [ms("Supply Chain Management", "Bahria University", "2008", "3.1/4")],
    experience: [job("Zong", "Procurement Manager", "2010-01-01", "", "Telecom procurement.", true)],
    placeholder: true,
  });
  // Same person as Nadia, uploaded by the agency: duplicate detection (C11) flags it.
  const nadiaAgency = candidate({
    name: "Nadia Hussain",
    email: "nadia.hussain.cp@placeholder.local",
    phone: "+92 312 4545454",
    gender: "Female",
    dob: "1986-05-17",
    cnic: "37405-6667778-2",
    domicile: "Rawalpindi",
    province: "Punjab",
    city: "Rawalpindi",
    education: [ms("Public Administration", "Fatima Jinnah Women University", "2010", "3.4/4")],
    experience: [job("Pakistan Railways", "Procurement Officer", "2011-01-01", "", "Public procurement under PPRA.", true)],
    placeholder: true,
  });
  const omar = candidate({
    name: "Omar Farooq",
    email: "omar.farooq@example.com",
    phone: "+92 300 9090909",
    gender: "Male",
    dob: "1991-07-07",
    cnic: "61101-8887776-5",
    domicile: "Islamabad",
    province: "Islamabad Capital Territory",
    city: "Islamabad",
    education: [ms("Physics", "Quaid-i-Azam University", "2016", "3.8/4"), bs("Physics", "Quaid-i-Azam University", "2014", "3.7/4")],
    experience: [job("Quaid-i-Azam University", "Visiting Lecturer", "2016-09-01", "", "Taught mechanics and lab courses.", true)],
    publications: [pub("Optical properties of doped ZnO films", "Journal of Applied Physics", "2021", "S. Akram; O. Farooq", 2, "Q2")],
  });
  const hina = candidate({
    name: "Hina Malik",
    email: "hina.malik@example.com",
    phone: "+92 334 3434343",
    gender: "Female",
    dob: "1993-10-15",
    cnic: "35201-1231231-0",
    domicile: "Lahore",
    province: "Punjab",
    city: "Lahore",
    education: [ms("Physics", "GC University Lahore", "2018", "3.6/4")],
    experience: [job("Punjab Group of Colleges", "Lecturer", "2018-09-01", "", "Intermediate physics.", true)],
  });
  const saad = candidate({
    name: "Saad Qureshi",
    email: "saad.qureshi@example.com",
    phone: "+92 302 5656565",
    gender: "Male",
    dob: "1992-02-02",
    cnic: "42201-9090901-3",
    domicile: "Hyderabad",
    province: "Sindh",
    city: "Hyderabad",
    education: [ms("Physics", "University of Sindh", "2017", "3.2/4")],
    experience: [job("University of Sindh", "Lab Engineer", "2017-08-01", "", "Physics labs.", true)],
  });
  const rabia = candidate({
    name: "Rabia Saeed",
    email: "rabia.saeed@example.com",
    phone: "+44 7700 900123",
    gender: "Female",
    dob: "1986-04-04",
    cnic: "35202-1010101-4",
    domicile: "Lahore",
    province: "Outside Pakistan",
    city: "London",
    country: "United Kingdom",
    timezone: "Europe/London",
    education: [phd("Economics", "London School of Economics", "2015")],
    experience: [job("University of Kent", "Senior Lecturer", "2015-09-01", "", "Development economics.", true)],
    publications: [pub("Microfinance and household resilience", "World Development", "2022", "R. Saeed; T. Brown", 1, "Q1")],
  });
  const tariq = candidate({
    name: "Tariq Mehmood",
    email: "tariq.mehmood@example.com",
    phone: "+92 300 3030303",
    gender: "Male",
    dob: "1980-11-11",
    cnic: "38403-4040404-7",
    domicile: "Faisalabad",
    province: "Punjab",
    city: "Faisalabad",
    education: [phd("Economics", "PIDE", "2012", "3.5/4")],
    experience: [job("PIDE", "Assistant Professor", "2012-09-01", "", "Macroeconomics.", true)],
    publications: [pub("Inflation expectations in Pakistan", "Pakistan Development Review", "2020", "T. Mehmood", 1, "Q3")],
  });

  /* Positions -------------------------------------------------------- */
  const actors = { hr: hr.id, ed: ed.id };
  const facultyJd = JD_TEMPLATES[0].content;
  const adminJd = JD_TEMPLATES[1].content;

  const cs = position(
    {
      title: "Assistant Professor, Computer Science",
      type: "faculty",
      department: "Computer Science",
      category: "Faculty",
      grade: "TTS Assistant Professor",
      posts: 2,
      reportingLine: "Dean of Computing",
      budgetLine: "DU-ACAD-CS-2026-01",
      justification: "Two posts needed to run the first BS Computer Science intake in Fall 2027.",
      discipline: "Computer Science",
      rank: "Assistant Professor",
      researchArea: "Machine learning, systems, software engineering",
      teachingAreas: "Programming, data structures, machine learning, databases",
      hiringLeadId: deanComp.id,
      createdBy: deanComp.id,
      stage: 9,
      approval: "approved",
      createdDaysAgo: 75,
      stageDays: [75, 72, 66, 60, 38, 27, 20, 9, 4],
      jd: { ...facultyJd, summary: "Join the founding Computer Science faculty to teach the first BS cohort and build a research group." },
      criteria: {
        items: [
          { key: "c1", type: "qualification", label: "PhD in Computer Science or a related field", value: "6", field: "computer, computing, software", mandatory: true },
          { key: "c2", type: "experience", label: "At least 2 years of teaching or research after the PhD", value: "2", mandatory: true },
          { key: "c3", type: "cgpa", label: "CGPA of 3.0 or more in the last degree", value: "3.0", mandatory: false },
          { key: "c4", type: "age", label: "Age 45 or under on the closing date", value: "45", cutoffDate: daysAgo(38).slice(0, 10), mandatory: false },
          { key: "c5", type: "document", label: "CV uploaded", value: "cv", mandatory: true },
          { key: "c6", type: "custom", label: "Publications in HEC-recognised journals", value: "", mandatory: false },
        ],
      },
      advert: { status: "closed", publishedDaysAgo: 66, closingDays: -38 },
    },
    actors,
  );

  const proc = position(
    {
      title: "Manager Procurement",
      type: "administrative",
      department: "Procurement",
      category: "Manager",
      grade: "BPS-18",
      reportingLine: "Director Finance",
      budgetLine: "DU-ADM-PROC-2026-01",
      justification: "Procurement for the campus build-out needs a full-time manager under PPRA rules.",
      hiringLeadId: headFin.id,
      createdBy: headFin.id,
      stage: 4,
      approval: "approved",
      createdDaysAgo: 30,
      stageDays: [30, 27, 21, 14],
      jd: { ...adminJd, summary: "Lead procurement for a growing university, in line with PPRA rules." },
      criteria: {
        items: [
          { key: "c1", type: "qualification", label: "Master's (16 years) in Supply Chain, Business or Public Administration", value: "4", field: "supply, business, public, administration", mandatory: true },
          { key: "c2", type: "experience", label: "At least 7 years of procurement experience", value: "7", mandatory: true },
          { key: "c3", type: "age", label: "Age 50 or under on the closing date", value: "50", cutoffDate: daysAhead(10).slice(0, 10), mandatory: true },
          { key: "c4", type: "document", label: "Experience letter uploaded", value: "experience_letter", mandatory: false },
        ],
      },
      advert: { status: "published", publishedDaysAgo: 21, closingDays: 10 },
    },
    actors,
  );

  const phys = position(
    {
      title: "Lecturer, Physics",
      type: "faculty",
      department: "Physics",
      category: "Faculty",
      grade: "BPS-18",
      reportingLine: "Dean of Sciences",
      budgetLine: "DU-ACAD-PHY-2026-01",
      justification: "Foundation-year physics teaching from Fall 2027.",
      discipline: "Physics",
      rank: "Lecturer",
      researchArea: "Condensed matter, optics",
      teachingAreas: "Mechanics, electricity and magnetism, physics labs",
      hiringLeadId: deanSci.id,
      createdBy: deanSci.id,
      stage: 10,
      approval: "approved",
      status: "filled",
      createdDaysAgo: 110,
      stageDays: [110, 107, 100, 92, 68, 60, 52, 45, 38, 30],
      jd: { ...facultyJd, summary: "Teach foundation-year physics and run the teaching labs.", requiredQualifications: ["MS / MPhil in Physics (18 years)"] },
      criteria: {
        items: [
          { key: "c1", type: "qualification", label: "MS or MPhil in Physics", value: "5", field: "physics", mandatory: true },
          { key: "c2", type: "cgpa", label: "CGPA of 3.0 or more", value: "3.0", mandatory: true },
          { key: "c3", type: "document", label: "CV uploaded", value: "cv", mandatory: true },
        ],
      },
      advert: { status: "closed", publishedDaysAgo: 100, closingDays: -68 },
    },
    actors,
  );

  position(
    {
      title: "Deputy Registrar",
      type: "administrative",
      department: "Registrar Office",
      category: "Manager",
      grade: "BPS-19",
      reportingLine: "Registrar",
      budgetLine: "DU-ADM-REG-2026-02",
      justification: "The Registrar Office needs a deputy to run examinations and records.",
      hiringLeadId: hr.id,
      createdBy: hr2.id,
      stage: 1,
      approval: "ed_review",
      createdDaysAgo: 4,
      stageDays: [4],
      jd: { ...adminJd, summary: "Run examinations, records and student services under the Registrar." },
      criteria: {
        items: [
          { key: "c1", type: "qualification", label: "Master's (16 years) in any discipline", value: "4", mandatory: true },
          { key: "c2", type: "experience", label: "At least 10 years in academic administration", value: "10", mandatory: true },
        ],
      },
    },
    actors,
  );

  const econ = position(
    {
      title: "Associate Professor, Economics",
      type: "faculty",
      department: "Economics",
      category: "Faculty",
      grade: "TTS Associate Professor",
      reportingLine: "Dean of Social Sciences",
      budgetLine: "DU-ACAD-ECO-2026-01",
      justification: "Senior economist to found the department and its research centre.",
      discipline: "Economics",
      rank: "Associate Professor",
      researchArea: "Development economics, public policy",
      teachingAreas: "Microeconomics, econometrics, development",
      hiringLeadId: deanSci.id,
      createdBy: deanSci.id,
      stage: 4,
      approval: "approved",
      createdDaysAgo: 18,
      stageDays: [18, 16, 12, 6],
      jd: { ...facultyJd, summary: "Found the Economics department and lead its research centre." },
      criteria: {
        items: [
          { key: "c1", type: "qualification", label: "PhD in Economics", value: "6", field: "economics", mandatory: true },
          { key: "c2", type: "experience", label: "At least 7 years after the PhD", value: "7", mandatory: true },
          { key: "c3", type: "custom", label: "At least 10 publications in HEC-recognised journals", value: "", mandatory: true },
        ],
      },
      advert: { status: "published", publishedDaysAgo: 12, closingDays: 20 },
    },
    actors,
  );

  position(
    {
      title: "Director Information Technology",
      type: "administrative",
      department: "Information Technology",
      category: "Director",
      grade: "BPS-20",
      reportingLine: "Executive Director",
      budgetLine: "DU-ADM-IT-2026-01",
      justification: "IT leadership for campus networks, systems and the student information system.",
      hiringLeadId: hr.id,
      createdBy: hr.id,
      stage: 2,
      approval: "approved",
      createdDaysAgo: 9,
      stageDays: [9, 5],
      jd: { ...adminJd, summary: "Lead IT for the whole university: networks, systems, security and support." },
      criteria: {
        items: [
          { key: "c1", type: "qualification", label: "Master's in Computer Science or IT", value: "5", field: "computer, information", mandatory: true },
          { key: "c2", type: "experience", label: "At least 12 years in IT, 5 of them leading teams", value: "12", mandatory: true },
        ],
      },
      advert: { status: "draft", publishedDaysAgo: 0, closingDays: 30 },
    },
    actors,
  );

  /* Applications ----------------------------------------------------- */
  const csApps = {
    ayesha: application(cs, ayesha, { status: "talk_scheduled", list: "short", daysAgo: 50, history: [["applied", 50], ["under_review", 37], ["shortlisted", 27], ["interview_scheduled", 22], ["talk_scheduled", 9]] }, hr.id),
    bilal: application(cs, bilal, { status: "interview_scheduled", list: "short", daysAgo: 45, history: [["applied", 45], ["under_review", 37], ["shortlisted", 27], ["interview_scheduled", 22]] }, hr.id),
    sana: application(cs, sana, { status: "interview_scheduled", list: "short", daysAgo: 44, history: [["applied", 44], ["under_review", 37], ["shortlisted", 27], ["interview_scheduled", 22]] }, hr.id),
    usman: application(cs, usman, { status: "shortlisted", list: "reserve", listReason: "Strong teaching record; research fit weaker than the top three.", daysAgo: 41, history: [["applied", 41], ["under_review", 37], ["shortlisted", 27]] }, hr.id),
    hamza: application(cs, hamza, { status: "not_selected", list: "not_shortlisted", listReason: "Does not hold a PhD (mandatory).", daysAgo: 40, history: [["applied", 40], ["under_review", 37], ["not_selected", 27]] }, hr.id),
    fatima: application(cs, fatima, { status: "under_review", list: "long", daysAgo: 39, history: [["applied", 39], ["under_review", 37]] }, hr.id),
  };

  const procApps = {
    imran: application(proc, imran, { status: "under_review", list: "long", daysAgo: 12, history: [["applied", 12], ["under_review", 3]] }, hr.id),
    zainab: application(proc, zainab, { status: "applied", daysAgo: 9 }, hr.id),
    nadia: application(proc, nadia, { status: "applied", daysAgo: 7 }, hr.id),
    kamran: application(proc, kamran, { status: "applied", daysAgo: 6, source: "agency", agencyId: agency.id }, hr.id),
    nadiaAgency: application(proc, nadiaAgency, { status: "applied", daysAgo: 5, source: "agency", agencyId: agency.id }, hr.id),
  };
  db.update(applications).set({ duplicateOfId: procApps.nadia.id }).where(eq(applications.id, procApps.nadiaAgency.id)).run();

  const physApps = {
    omar: application(phys, omar, { status: "selected", list: "short", daysAgo: 80, history: [["applied", 80], ["under_review", 67], ["shortlisted", 60], ["interview_scheduled", 54], ["selected", 30]] }, hr.id),
    hina: application(phys, hina, { status: "shortlisted", list: "reserve", daysAgo: 78, history: [["applied", 78], ["under_review", 67], ["shortlisted", 60], ["interview_scheduled", 54]] }, hr.id),
    saad: application(phys, saad, { status: "not_selected", list: "short", daysAgo: 75, history: [["applied", 75], ["under_review", 67], ["shortlisted", 60], ["interview_scheduled", 54], ["not_selected", 28]] }, hr.id),
  };
  // Hina's history ended at interview; her current status is the reserve shortlist.
  db.update(applications).set({ status: "interview_scheduled" }).where(eq(applications.id, physApps.hina.id)).run();

  const econApps = {
    rabia: application(econ, rabia, { status: "applied", daysAgo: 5 }, hr.id),
    tariq: application(econ, tariq, { status: "applied", daysAgo: 3 }, hr.id),
  };

  return {
    users: { admin, ed, hr, hr2, deanSci, deanComp, headFin, revInt, revExt, panelChair, panelA, panelB, panelC, panelD, boardChair, boardMember, agency },
    candidates: { ayesha, bilal, sana, usman, hamza, fatima, imran, zainab, nadia, kamran, omar, hina, saad, rabia, tariq },
    positions: { cs, proc, phys, econ },
    apps: { cs: csApps, proc: procApps, phys: physApps, econ: econApps },
  };
}

export type SeedContext = ReturnType<typeof seedBase>;
