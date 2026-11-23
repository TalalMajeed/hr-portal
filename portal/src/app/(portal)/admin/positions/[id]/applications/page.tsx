import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, reviewAssignments, users, type ListStatus } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { isEligible } from "@/lib/eligibility";
import { getDoc } from "@/lib/positions";
import { weightedTotal } from "@/lib/scoring";
import { experienceYears, highestLevel } from "@/lib/screening";
import { average, formatShortDate, round1, spread } from "@/lib/format";
import { APPLICATION_STATUS, DEGREE_LEVELS, LIST_STATUS, STAFF_ROLES, degreeLabel } from "@/lib/constants";
import { addReviewerAction, bulkApplicationsAction } from "@/actions/shortlisting";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox, Field, FormGrid, Input, Select } from "@/components/ui/field";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApplicationStatusBadge, EligibilityBadge, ListStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SelectAll } from "@/components/shortlisting/select-all";
import { ShortlistApproval } from "@/components/shortlisting/shortlist-approval";

export const metadata: Metadata = { title: "Applications" };

const SORTS = {
  submitted_desc: "Newest first",
  submitted_asc: "Oldest first",
  name: "Name",
  score: "Reviewer score",
  experience: "Experience",
} as const;

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function ApplicationsPage({ params, searchParams }: PageProps<"/admin/positions/[id]/applications">) {
  const user = await requireUser(STAFF_ROLES);
  const { id } = await params;
  const position = await positionForPage(user, id);
  const sp = await searchParams;
  const f = {
    q: one(sp.q).toLowerCase(),
    status: one(sp.status),
    list: one(sp.list),
    level: one(sp.level),
    exp: one(sp.exp),
    from: one(sp.from),
    to: one(sp.to),
    elig: one(sp.elig),
    source: one(sp.source),
    dup: one(sp.dup),
    sort: (one(sp.sort) || "submitted_desc") as keyof typeof SORTS,
  };

  const rows = db
    .select({ app: applications, candidate: users })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(and(eq(applications.positionId, position.id), ne(applications.status, "draft")))
    .orderBy(asc(applications.submittedAt))
    .all();
  const appIds = rows.map((r) => r.app.id);
  const reviews = appIds.length
    ? db
        .select({ ra: reviewAssignments, reviewer: users })
        .from(reviewAssignments)
        .innerJoin(users, eq(users.id, reviewAssignments.reviewerId))
        .where(inArray(reviewAssignments.applicationId, appIds))
        .all()
    : [];
  const items = getDoc(position.id, "rubric")?.shortlisting ?? [];
  const duplicateTargets = new Set(rows.map((r) => r.app.duplicateOfId).filter(Boolean));

  const enriched = rows.map(({ app, candidate }) => {
    const snap = app.snapshot;
    const edu = snap?.profile.education ?? [];
    const exp = snap?.profile.experience ?? [];
    const mine = reviews.filter((r) => r.ra.applicationId === app.id);
    const totals = mine.filter((r) => r.ra.submittedAt).map((r) => weightedTotal(r.ra.scores, items)).filter((n): n is number => n !== null);
    return {
      app,
      candidate,
      level: highestLevel(edu),
      years: experienceYears(exp),
      eligible: isEligible(app),
      assigned: mine.length,
      reviewed: totals.length,
      avg: average(totals),
      sd: spread(totals),
      duplicate: !!app.duplicateOfId || duplicateTargets.has(app.id),
    };
  });

  // D8 summary sheet
  const summary = {
    received: enriched.length,
    screenedOut: enriched.filter((r) => !r.eligible || r.app.listStatus === "not_shortlisted").length,
    reviewed: enriched.filter((r) => r.reviewed > 0).length,
    shortlisted: enriched.filter((r) => r.app.listStatus === "short").length,
    reserve: enriched.filter((r) => r.app.listStatus === "reserve").length,
    withdrawn: enriched.filter((r) => r.app.status === "withdrawn").length,
  };

  const filtered = enriched
    .filter((r) => {
      if (f.q && !`${r.candidate.name} ${r.app.appNo} ${r.candidate.email}`.toLowerCase().includes(f.q)) return false;
      if (f.status && r.app.status !== f.status) return false;
      if (f.list && r.app.listStatus !== f.list) return false;
      if (f.level && r.level < Number(f.level)) return false;
      if (f.exp && r.years < Number(f.exp)) return false;
      if (f.from && (r.app.submittedAt ?? "") < f.from) return false;
      if (f.to && (r.app.submittedAt ?? "").slice(0, 10) > f.to) return false;
      if (f.elig === "met" && !r.eligible) return false;
      if (f.elig === "not_met" && r.eligible) return false;
      if (f.source && r.app.source !== f.source) return false;
      if (f.dup === "1" && !r.duplicate) return false;
      return true;
    })
    .sort((a, b) => {
      switch (f.sort) {
        case "submitted_asc":
          return (a.app.submittedAt ?? "").localeCompare(b.app.submittedAt ?? "");
        case "name":
          return a.candidate.name.localeCompare(b.candidate.name);
        case "score":
          return (b.avg ?? -1) - (a.avg ?? -1);
        case "experience":
          return b.years - a.years;
        default:
          return (b.app.submittedAt ?? "").localeCompare(a.app.submittedAt ?? "");
      }
    });

  const reviewerList = db.select().from(users).where(and(eq(users.role, "reviewer"), eq(users.active, true))).orderBy(asc(users.name)).all();
  const anyFilter = Object.entries(f).some(([k, v]) => k !== "sort" && v);
  const base = `/admin/positions/${position.id}/applications`;

  return (
    <div className="grid gap-6">
      <StatGrid>
        <Stat label="Received" value={summary.received} hint={summary.withdrawn ? `${summary.withdrawn} withdrawn` : undefined} />
        <Stat label="Screened out" value={summary.screenedOut} hint="Not eligible or not shortlisted" />
        <Stat label="Reviewed" value={summary.reviewed} hint="At least one score in" />
        <Stat label="Shortlisted" value={summary.shortlisted} hint={`${summary.reserve} on the reserve list`} />
      </StatGrid>

      <ShortlistApproval positionId={position.id} shortCount={summary.shortlisted} user={user} />

      <Card>
        <CardHeader title="Find applications" />
        <CardBody>
          <form method="get" action={base} className="grid gap-4">
            <FormGrid cols={3}>
              <Field label="Search" htmlFor="q">
                <Input id="q" name="q" defaultValue={one(sp.q)} placeholder="Name, email or application number" />
              </Field>
              <Field label="Status" htmlFor="status">
                <Select id="status" name="status" defaultValue={f.status}>
                  <option value="">Any status</option>
                  {Object.entries(APPLICATION_STATUS)
                    .filter(([k]) => k !== "draft")
                    .map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                </Select>
              </Field>
              <Field label="List" htmlFor="list">
                <Select id="list" name="list" defaultValue={f.list}>
                  <option value="">Any list</option>
                  {Object.entries(LIST_STATUS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Qualification at least" htmlFor="level">
                <Select id="level" name="level" defaultValue={f.level}>
                  <option value="">Any</option>
                  {DEGREE_LEVELS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Experience at least (years)" htmlFor="exp">
                <Input id="exp" name="exp" type="number" min={0} step={1} inputMode="numeric" defaultValue={f.exp} />
              </Field>
              <Field label="Eligibility" htmlFor="elig">
                <Select id="elig" name="elig" defaultValue={f.elig}>
                  <option value="">Any</option>
                  <option value="met">Meets criteria</option>
                  <option value="not_met">Does not meet criteria</option>
                </Select>
              </Field>
              <Field label="Submitted from" htmlFor="from">
                <Input id="from" name="from" type="date" defaultValue={f.from} />
              </Field>
              <Field label="Submitted to" htmlFor="to">
                <Input id="to" name="to" type="date" defaultValue={f.to} />
              </Field>
              <Field label="Source" htmlFor="source">
                <Select id="source" name="source" defaultValue={f.source}>
                  <option value="">Any source</option>
                  <option value="direct">Direct</option>
                  <option value="agency">Agency</option>
                  <option value="referral">Referral</option>
                </Select>
              </Field>
              <Field label="Sort by" htmlFor="sort">
                <Select id="sort" name="sort" defaultValue={f.sort}>
                  {Object.entries(SORTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </Field>
            </FormGrid>
            <Checkbox name="dup" value="1" defaultChecked={f.dup === "1"} label="Only possible duplicates" />
            <div className="flex flex-wrap gap-2">
              <button type="submit" className={buttonClass("primary")}>
                Apply filters
              </button>
              {anyFilter && (
                <ButtonLink href={base} variant="ghost">
                  Clear filters
                </ButtonLink>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      {enriched.length === 0 ? (
        <EmptyState title="No applications yet">Applications appear here as soon as candidates submit them.</EmptyState>
      ) : (
        <ActionForm action={bulkApplicationsAction} className="grid gap-4">
          <input type="hidden" name="positionId" value={position.id} />
          <p className="text-[15px] text-muted">
            Showing {filtered.length} of {enriched.length}. Tick applications, then move them to a list or assign reviewers below.
          </p>
          {filtered.length === 0 ? (
            <EmptyState title="No applications match these filters" action={<ButtonLink href={base} variant="secondary">Clear filters</ButtonLink>} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH className="w-10">
                    <SelectAll />
                  </TH>
                  <TH>Candidate</TH>
                  <TH>Submitted</TH>
                  <TH>Highest degree</TH>
                  <TH className="text-right">Experience</TH>
                  <TH>Eligibility</TH>
                  <TH>Source</TH>
                  <TH>List</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Reviews</TH>
                </tr>
              </THead>
              <tbody>
                {filtered.map((r) => (
                  <TR key={r.app.id}>
                    <TD>
                      <input type="checkbox" name="ids" value={r.app.id} aria-label={`Select ${r.candidate.name}`} className="mt-1 size-[18px] cursor-pointer accent-teal" />
                    </TD>
                    <TD className="min-w-48">
                      <Link href={`/admin/applications/${r.app.id}`} className="font-semibold">
                        {r.candidate.name}
                      </Link>
                      <p className="text-sm text-muted">{r.app.appNo}</p>
                    </TD>
                    <TD className="whitespace-nowrap">{formatShortDate(r.app.submittedAt)}</TD>
                    <TD className="min-w-40">{r.level ? degreeLabel(String(r.level)) : <span className="text-muted">None</span>}</TD>
                    <TD className="text-right tabular-nums whitespace-nowrap">{r.years.toFixed(1)} yrs</TD>
                    <TD>
                      <EligibilityBadge passed={r.eligible} overridden={!!r.app.eligibilityOverride} />
                    </TD>
                    <TD className="whitespace-nowrap">
                      <span className="capitalize">{r.app.source}</span>
                      {r.duplicate && (
                        <Badge tone="warning" className="ml-2">
                          Possible duplicate
                        </Badge>
                      )}
                    </TD>
                    <TD>
                      <ListStatusBadge status={r.app.listStatus} />
                    </TD>
                    <TD>
                      <ApplicationStatusBadge status={r.app.status} />
                    </TD>
                    <TD className="text-right whitespace-nowrap tabular-nums">
                      {r.reviewed}/{r.assigned}
                      {r.avg !== null && (
                        <p className="text-sm text-muted">
                          avg {round1(r.avg)} · spread {round1(r.sd)}
                        </p>
                      )}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Move to a list" description="Long list, shortlist, reserve list or not shortlisted." />
              <CardBody className="grid gap-3">
                <Field label="Move ticked applications to" htmlFor="listStatus">
                  <Select id="listStatus" name="listStatus" defaultValue="long">
                    {(["long", "short", "reserve", "not_shortlisted", "pending"] as ListStatus[]).map((k) => (
                      <option key={k} value={k}>
                        {LIST_STATUS[k].label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reason" htmlFor="reason" hint="Required for not shortlisted. HR only; candidates never see it.">
                  <Input id="reason" name="reason" />
                </Field>
                <div>
                  <SubmitButton name="intent" value="list" pendingText="Moving…">
                    Move applications
                  </SubmitButton>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Assign to reviewers" description="Each reviewer scores against the shortlisting rubric." />
              <CardBody className="grid gap-3">
                {reviewerList.length === 0 ? (
                  <p className="text-muted">No reviewers yet. Add one below.</p>
                ) : (
                  <fieldset className="grid gap-2">
                    <legend className="mb-1 text-[15px] font-medium">Reviewers</legend>
                    {reviewerList.map((r) => (
                      <Checkbox
                        key={r.id}
                        name="reviewerIds"
                        value={r.id}
                        label={`${r.name}${r.external ? " (external)" : ""}`}
                        hint={[r.designation, r.organisation].filter(Boolean).join(", ")}
                      />
                    ))}
                  </fieldset>
                )}
                <div>
                  <SubmitButton name="intent" value="assign" variant="secondary" pendingText="Assigning…">
                    Assign ticked applications
                  </SubmitButton>
                </div>
              </CardBody>
            </Card>
          </div>
        </ActionForm>
      )}

      <Card>
        <CardHeader title="Add a reviewer" description="External reviewers get a secure link by email and don't need an account." />
        <CardBody>
          <ActionForm action={addReviewerAction} className="grid gap-4" resetOnSuccess>
            <input type="hidden" name="positionId" value={position.id} />
            <FormGrid>
              <Field label="Name" htmlFor="rv-name" required>
                <Input id="rv-name" name="name" required />
              </Field>
              <Field label="Email" htmlFor="rv-email" required>
                <Input id="rv-email" name="email" type="email" required />
              </Field>
              <Field label="Designation" htmlFor="rv-designation">
                <Input id="rv-designation" name="designation" />
              </Field>
              <Field label="Organisation" htmlFor="rv-org">
                <Input id="rv-org" name="organisation" />
              </Field>
            </FormGrid>
            <Checkbox name="external" defaultChecked label="External reviewer" hint="Works through a secure link instead of a password" />
            <div>
              <SubmitButton>Add reviewer</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}
