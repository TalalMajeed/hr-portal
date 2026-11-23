import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  applications,
  boardDecisions,
  candidateProfiles,
  evaluations,
  events,
  offers,
  panelMembers,
  panels,
  positionEvents,
  positions,
  users,
} from "@/lib/db/schema";
import { APPLICATION_STATUS, LIST_STATUS, STAGES, degreeLabel } from "@/lib/constants";
import { daysBetween, formatShortDate } from "@/lib/format";
import { isEligible } from "@/lib/eligibility";

export type Cell = string | number;
export type ReportTable = { key: string; title: string; description: string; columns: string[]; rows: Cell[][]; numeric?: number[] };

/** Optional limit to positions a hiring lead can see. */
type Scope = number[] | null;

async function load(scope: Scope) {
  const ps = (await db.select().from(positions)).filter((p) => !scope || scope.includes(p.id));
  const ids = new Set(ps.map((p) => p.id));
  const apps = (await db.select().from(applications)).filter((a) => ids.has(a.positionId) && a.status !== "draft");
  return { ps, apps };
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "0%");

/** I2: applications received, shortlisted, rejected and selected per post. */
export async function summaryReport(scope: Scope): Promise<ReportTable> {
  const { ps, apps } = await load(scope);
  return {
    key: "summary",
    title: "Summary per post",
    description: "Applications received, shortlisted, rejected and selected for each position.",
    columns: ["Code", "Position", "Type", "Stage", "Received", "Shortlisted", "Rejected", "Selected", "Withdrawn"],
    numeric: [4, 5, 6, 7, 8],
    rows: ps.map((p) => {
      const mine = apps.filter((a) => a.positionId === p.id);
      return [
        p.code,
        p.title,
        p.type === "faculty" ? "Faculty" : "Administrative",
        `${p.stage}. ${STAGES[p.stage - 1].short}`,
        mine.length,
        mine.filter((a) => a.listStatus === "short").length,
        mine.filter((a) => a.status === "not_selected" || a.listStatus === "not_shortlisted").length,
        mine.filter((a) => a.status === "selected").length,
        mine.filter((a) => a.status === "withdrawn").length,
      ];
    }),
  };
}

/** I3: applied, screened, shortlisted, interviewed, talk or second round, recommended, offered, joined. */
export async function pipelineReport(scope: Scope): Promise<ReportTable> {
  const { ps, apps } = await load(scope);
  const evals = (await db.select().from(evaluations));
  const ev = (await db.select().from(events));
  const decisions = (await db.select().from(boardDecisions));
  const offerRows = (await db.select().from(offers));
  return {
    key: "pipeline",
    title: "Pipeline per position",
    description: "How many candidates reached each step, from application to joining.",
    columns: ["Code", "Position", "Applied", "Screened", "Shortlisted", "Interviewed", "Talk / 2nd round", "Recommended", "Offered", "Joined"],
    numeric: [2, 3, 4, 5, 6, 7, 8, 9],
    rows: ps.map((p) => {
      const mine = apps.filter((a) => a.positionId === p.id);
      const ids = new Set(mine.map((a) => a.id));
      const interviewed = new Set([
        ...evals.filter((e) => ids.has(e.applicationId) && e.round === "interview" && e.status === "submitted").map((e) => e.applicationId),
        ...ev.filter((e) => ids.has(e.applicationId) && e.round === "interview" && e.status === "completed").map((e) => e.applicationId),
      ]);
      const talk = new Set(ev.filter((e) => ids.has(e.applicationId) && e.round !== "interview" && !["cancelled", "declined"].includes(e.status)).map((e) => e.applicationId));
      const myOffers = offerRows.filter((o) => ids.has(o.applicationId));
      return [
        p.code,
        p.title,
        mine.length,
        mine.filter((a) => a.listStatus !== "pending").length,
        mine.filter((a) => a.listStatus === "short").length,
        interviewed.size,
        talk.size,
        decisions.filter((d) => ids.has(d.applicationId) && d.decision === "recommended").length,
        myOffers.length,
        myOffers.filter((o) => o.joinedAt).length,
      ];
    }),
  };
}

/** I4: faculty and administrative posts sanctioned, filled, in process and vacant. */
export async function hrSummaryReport(scope: Scope): Promise<ReportTable> {
  const { ps } = await load(scope);
  const offerRows = (await db.select().from(offers));
  const rows: Cell[][] = (["faculty", "administrative"] as const).map((type) => {
    const mine = ps.filter((p) => p.type === type && p.approvalStatus === "approved" && p.status !== "withdrawn");
    const sanctioned = mine.reduce((s, p) => s + p.posts, 0);
    const filled = mine.reduce((s, p) => s + Math.min(p.posts, offerRows.filter((o) => o.positionId === p.id && (o.joinedAt || o.status === "accepted")).length), 0);
    const inProcess = mine.filter((p) => p.status === "active" && p.stage >= 3).reduce((s, p) => s + p.posts, 0) - mine.filter((p) => p.status === "active" && p.stage >= 3).reduce((s, p) => s + Math.min(p.posts, offerRows.filter((o) => o.positionId === p.id && (o.joinedAt || o.status === "accepted")).length), 0);
    const vacant = Math.max(0, sanctioned - filled - inProcess);
    return [type === "faculty" ? "Faculty" : "Administrative", sanctioned, filled, inProcess, vacant];
  });
  rows.push(["Total", ...[1, 2, 3, 4].map((i) => rows.reduce((s, r) => s + Number(r[i]), 0))]);
  return {
    key: "hr",
    title: "Faculty and administrative HR summary",
    description: "Approved posts sanctioned, filled, in process and still vacant.",
    columns: ["Group", "Sanctioned", "Filled", "In process", "Vacant"],
    numeric: [1, 2, 3, 4],
    rows,
  };
}

/** I5: days from the position request to an accepted offer, and days spent in each stage. */
export async function timeToHireReport(scope: Scope): Promise<ReportTable> {
  const { ps } = await load(scope);
  const evs = (await db.select().from(positionEvents)).filter((e) => e.type === "stage_changed");
  const offerRows = (await db.select().from(offers));
  return {
    key: "time",
    title: "Time to hire",
    description: "Days from the position request to an accepted offer, and the days each stage took. Open positions count up to today.",
    columns: ["Code", "Position", "Total days", "Hired", ...STAGES.map((s) => `${s.n}. ${s.short}`)],
    numeric: [2, ...STAGES.map((_, i) => i + 4)],
    rows: ps.map((p) => {
      const accepted = offerRows.filter((o) => o.positionId === p.id && o.respondedAt && o.status === "accepted").sort((a, b) => a.respondedAt!.localeCompare(b.respondedAt!))[0];
      const end = accepted?.respondedAt ?? new Date().toISOString();
      const entered: Record<number, string> = { 1: p.createdAt };
      for (const e of evs.filter((x) => x.positionId === p.id)) if (e.toStage && !entered[e.toStage]) entered[e.toStage] = e.createdAt;
      const perStage = STAGES.map((s) => {
        const start = entered[s.n];
        if (!start) return "";
        const nextStart = STAGES.slice(s.n).map((n) => entered[n.n]).find(Boolean) ?? (s.n === p.stage ? end : "");
        return nextStart ? Math.max(0, daysBetween(start, nextStart) ?? 0) : "";
      });
      return [p.code, p.title, daysBetween(p.createdAt, end) ?? "", accepted ? formatShortDate(accepted.respondedAt) : "Not yet", ...perStage];
    }),
  };
}

/** I6: where applications come from, and how each agency performs. */
export async function sourceReport(scope: Scope): Promise<ReportTable> {
  const { apps } = await load(scope);
  const agencies = (await db.select().from(users).where(eq(users.role, "agency")));
  const decisions = (await db.select().from(boardDecisions));
  const row = (label: string, list: typeof apps): Cell[] => [
    label,
    list.length,
    list.filter((a) => isEligible(a)).length,
    list.filter((a) => a.listStatus === "short").length,
    list.filter((a) => decisions.some((d) => d.applicationId === a.id && d.decision === "recommended")).length,
    list.filter((a) => a.status === "selected").length,
    list.filter((a) => a.duplicateOfId).length,
    pct(list.filter((a) => a.listStatus === "short").length, list.length),
  ];
  return {
    key: "source",
    title: "Sources and agency performance",
    description: "Applications by source, and each agency's candidates through the process.",
    columns: ["Source", "Applications", "Eligible", "Shortlisted", "Recommended", "Selected", "Duplicates", "Shortlist rate"],
    numeric: [1, 2, 3, 4, 5, 6],
    rows: [
      row("Direct", apps.filter((a) => a.source === "direct")),
      row("Agency (all)", apps.filter((a) => a.source === "agency")),
      row("Referral", apps.filter((a) => a.source === "referral")),
      ...agencies.map((ag) => row(`Agency: ${ag.organisation || ag.name}`, apps.filter((a) => a.agencyId === ag.id))),
    ],
  };
}

/** I7: panels served and evaluations submitted, and whether on time (within 48 hours of the session). */
export async function panelActivityReport(scope: Scope): Promise<ReportTable> {
  const { ps } = await load(scope);
  const ids = new Set(ps.map((p) => p.id));
  const members = (await db
    .select({ m: panelMembers, u: users, p: panels })
    .from(panelMembers)
    .innerJoin(users, eq(users.id, panelMembers.userId))
    .innerJoin(panels, eq(panels.id, panelMembers.panelId))
    )
    .filter((r) => ids.has(r.p.positionId));
  const evals = (await db.select().from(evaluations));
  const evs = new Map((await db.select().from(events)).map((e) => [e.id, e]));
  const people = new Map<number, typeof users.$inferSelect>();
  for (const r of members) people.set(r.u.id, r.u);
  return {
    key: "panel",
    title: "Panel activity",
    description: "Panels each member served on, evaluations submitted, and how many were on time (within 48 hours of the session).",
    columns: ["Panel member", "Organisation", "Panels", "Chaired", "Declined", "Evaluations due", "Submitted", "On time"],
    numeric: [2, 3, 4, 5, 6, 7],
    rows: [...people.values()].map((u) => {
      const mine = members.filter((r) => r.u.id === u.id);
      const myEvals = evals.filter((e) => e.panelistId === u.id && ids.has(evs.get(e.eventId)?.positionId ?? -1));
      const submitted = myEvals.filter((e) => e.status === "submitted" && e.submittedAt);
      const onTime = submitted.filter((e) => {
        const ev = evs.get(e.eventId);
        if (!ev) return false;
        const end = new Date(ev.startsAt).getTime() + ev.durationMin * 60_000;
        return new Date(e.submittedAt!).getTime() - end <= 48 * 3_600_000;
      });
      return [
        u.name,
        `${u.organisation}${u.external ? " (external)" : ""}`,
        mine.filter((r) => r.m.inviteStatus === "accepted").length,
        mine.filter((r) => r.m.isChair && r.m.inviteStatus === "accepted").length,
        mine.filter((r) => r.m.inviteStatus === "declined" || r.m.inviteStatus === "replaced").length,
        myEvals.length,
        submitted.length,
        onTime.length,
      ];
    }),
  };
}

/** I8: applicant profile for diversity and outreach. Counts unique candidates. */
export async function applicantProfileReport(scope: Scope): Promise<ReportTable> {
  const { apps } = await load(scope);
  const candidateIds = [...new Set(apps.map((a) => a.candidateId))];
  const profiles = (await db.select().from(candidateProfiles)).filter((p) => candidateIds.includes(p.userId));
  const total = profiles.length;
  const tally = (dimension: string, values: string[]) => {
    const m = new Map<string, number>();
    for (const v of values) m.set(v || "Not given", (m.get(v || "Not given") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]): Cell[] => [dimension, k, n, pct(n, total)]);
  };
  const highest = (p: (typeof profiles)[number]) => {
    const top = [...p.education].sort((a, b) => Number(b.level) - Number(a.level))[0];
    return top ? degreeLabel(top.level) : "";
  };
  return {
    key: "applicants",
    title: "Applicant profile",
    description: `Gender, province, domicile, highest degree and country of residence of ${total} unique applicants.`,
    columns: ["Dimension", "Value", "Applicants", "Share"],
    numeric: [2],
    rows: [
      ...tally("Gender", profiles.map((p) => p.gender)),
      ...tally("Province", profiles.map((p) => p.province)),
      ...tally("Domicile", profiles.map((p) => p.domicile)),
      ...tally("Highest degree", profiles.map(highest)),
      ...tally("Country of residence", profiles.map((p) => p.country)),
    ],
  };
}

/** I9: every application of a post with its status. */
export async function applicationsReport(positionId: number): Promise<ReportTable> {
  const p = (await db.select().from(positions).where(eq(positions.id, positionId)))[0];
  const rows = (await db
    .select({ a: applications, u: users, prof: candidateProfiles })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.userId, users.id))
    .where(eq(applications.positionId, positionId))
    )
    .filter((r) => r.a.status !== "draft");
  return {
    key: "applications",
    title: `Applications: ${p?.title ?? ""}`,
    description: `${p?.code ?? ""}. Every application with its status.`,
    columns: ["Application no.", "Name", "Email", "Mobile", "Gender", "City", "Country", "Highest degree", "Source", "Submitted", "Eligibility", "List", "Status"],
    rows: rows.map(({ a, u, prof }) => {
      const top = prof ? [...prof.education].sort((x, y) => Number(y.level) - Number(x.level))[0] : undefined;
      return [
        a.appNo ?? "",
        u.name,
        u.email.endsWith("@placeholder.local") ? "" : u.email,
        u.phone,
        prof?.gender ?? "",
        prof?.city ?? "",
        prof?.country ?? "",
        top ? `${top.degree} (${top.institution})` : "",
        a.source,
        formatShortDate(a.submittedAt),
        isEligible(a) ? "Meets criteria" : "Does not meet",
        LIST_STATUS[a.listStatus].label,
        APPLICATION_STATUS[a.status].label,
      ];
    }),
  };
}

export const REPORTS: Record<string, (scope: Scope) => Promise<ReportTable>> = {
  summary: summaryReport,
  pipeline: pipelineReport,
  hr: hrSummaryReport,
  time: timeToHireReport,
  source: sourceReport,
  panel: panelActivityReport,
  applicants: applicantProfileReport,
};
