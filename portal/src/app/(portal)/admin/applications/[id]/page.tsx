import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  adverts,
  applicationNotes,
  applications,
  applicationStatusHistory,
  documentRequests,
  documents,
  events,
  positions,
  reviewAssignments,
  users,
} from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { canViewApplication } from "@/lib/access";
import { audit } from "@/lib/audit";
import { isEligible } from "@/lib/eligibility";
import { getDoc } from "@/lib/positions";
import { buildSnapshot } from "@/lib/applications";
import { weightedTotal } from "@/lib/scoring";
import { average, formatDateTime, formatDual, formatShortDate, round1, spread } from "@/lib/format";
import { APPLICATION_STATUS, LIST_STATUS, ROUND_LABELS, STAFF_ROLES, documentKindLabel } from "@/lib/constants";
import {
  addNoteAction,
  assignReviewerAction,
  changeStatusAction,
  overrideEligibilityAction,
  requestDocumentAction,
  setListStatusAction,
  setRejectionAction,
  uploadSupportingAction,
} from "@/actions/shortlisting";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { ApplicationStatusBadge, EligibilityBadge, EventStatusBadge, ListStatusBadge } from "@/components/ui/status-badge";
import { DocumentList, ProfileView } from "@/components/applications/profile-view";

export const metadata: Metadata = { title: "Application" };

export default async function ApplicationPage({ params }: PageProps<"/admin/applications/[id]">) {
  const user = await requireUser(STAFF_ROLES);
  const { id } = await params;
  const appId = Number(id);
  if (!Number.isInteger(appId) || !canViewApplication(user, appId)) notFound();
  const app = db.select().from(applications).where(eq(applications.id, appId)).get()!;
  const position = db.select().from(positions).where(eq(positions.id, app.positionId)).get()!;
  const candidate = db.select().from(users).where(eq(users.id, app.candidateId)).get()!;
  const advert = db.select().from(adverts).where(eq(adverts.positionId, position.id)).get();
  audit(user.id, "viewed", "application", app.id, app.appNo ?? "");

  const items = getDoc(position.id, "rubric")?.shortlisting ?? [];
  const reviews = db
    .select({ ra: reviewAssignments, reviewer: users })
    .from(reviewAssignments)
    .innerJoin(users, eq(users.id, reviewAssignments.reviewerId))
    .where(eq(reviewAssignments.applicationId, app.id))
    .orderBy(asc(reviewAssignments.id))
    .all();
  const totals = reviews.filter((r) => r.ra.submittedAt).map((r) => weightedTotal(r.ra.scores, items)).filter((n): n is number => n !== null);
  const reviewerList = db.select().from(users).where(eq(users.role, "reviewer")).orderBy(asc(users.name)).all();

  const notes = db
    .select({ n: applicationNotes, by: users.name })
    .from(applicationNotes)
    .innerJoin(users, eq(users.id, applicationNotes.userId))
    .where(eq(applicationNotes.applicationId, app.id))
    .orderBy(desc(applicationNotes.id))
    .all();
  const requests = db.select().from(documentRequests).where(eq(documentRequests.applicationId, app.id)).orderBy(desc(documentRequests.id)).all();
  const attachedDocs = db.select().from(documents).where(eq(documents.applicationId, app.id)).orderBy(asc(documents.id)).all();
  const history = db
    .select({ h: applicationStatusHistory, by: users.name })
    .from(applicationStatusHistory)
    .leftJoin(users, eq(users.id, applicationStatusHistory.userId))
    .where(eq(applicationStatusHistory.applicationId, app.id))
    .orderBy(desc(applicationStatusHistory.id))
    .all();
  const sessions = db.select().from(events).where(eq(events.applicationId, app.id)).orderBy(asc(events.startsAt)).all();
  const duplicates = db
    .select({ a: applications, name: users.name, positionTitle: positions.title })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .where(
      app.duplicateOfId
        ? or(eq(applications.id, app.duplicateOfId), and(isNotNull(applications.duplicateOfId), eq(applications.duplicateOfId, app.id)))
        : and(isNotNull(applications.duplicateOfId), eq(applications.duplicateOfId, app.id)),
    )
    .all();
  const agency = app.agencyId ? db.select().from(users).where(eq(users.id, app.agencyId)).get() : null;
  const eligible = isEligible(app);
  const tz = app.snapshot?.profile.timezone;
  const requestDocIds = requests.map((r) => r.documentId).filter((n): n is number => !!n);
  const fulfilledDocs = requestDocIds.length ? db.select().from(documents).where(inArray(documents.id, requestDocIds)).all() : [];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Positions", href: "/admin/positions" },
          { label: position.code, href: `/admin/positions/${position.id}` },
          { label: "Applications", href: `/admin/positions/${position.id}/applications` },
          { label: app.appNo ?? "Draft" },
        ]}
        title={candidate.name}
        description={`${app.appNo ?? "Draft"} · ${position.title} · submitted ${formatShortDate(app.submittedAt)}`}
        meta={
          <>
            <ApplicationStatusBadge status={app.status} />
            <ListStatusBadge status={app.listStatus} />
            <EligibilityBadge passed={eligible} overridden={!!app.eligibilityOverride} />
            <Badge tone={app.source === "direct" ? "neutral" : "sand"}>
              {app.source === "agency" ? `Agency: ${agency?.organisation || agency?.name || "unknown"}` : app.source === "referral" ? "Referral" : "Direct"}
            </Badge>
          </>
        }
      />

      {duplicates.length > 0 && (
        <Notice tone="warning" title="Possible duplicate (C11)" className="mb-6">
          The same person may have applied more than once, for example directly and through an agency:
          <ul className="mt-1 list-disc pl-5">
            {duplicates.map((d) => (
              <li key={d.a.id}>
                <Link href={`/admin/applications/${d.a.id}`}>
                  {d.name}, {d.a.appNo}
                </Link>{" "}
                ({d.a.source}, {d.positionTitle})
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader title="Eligibility check" description="Checked against the post's criteria when the application was submitted." />
            <CardBody className="grid gap-4">
              {app.eligibility?.items.length ? (
                <ul className="grid gap-2">
                  {app.eligibility.items.map((i) => (
                    <li key={i.key} className="flex flex-wrap items-start justify-between gap-2 rounded-[4px] border border-line px-3 py-2.5">
                      <span className="min-w-0">
                        <span className="block font-medium">{i.label}</span>
                        <span className="block text-sm text-muted">{i.note}</span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <Badge tone={i.mandatory ? "teal" : "neutral"}>{i.mandatory ? "Mandatory" : "Desirable"}</Badge>
                        <Badge tone={i.met ? "success" : i.mandatory ? "danger" : "warning"}>{i.met ? "Met" : "Not met"}</Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">This post had no criteria when the application came in.</p>
              )}
              {app.eligibilityOverride && (
                <Notice tone="info" title={`HR override: ${app.eligibilityOverride === "met" ? "meets criteria" : "does not meet criteria"}`}>
                  {app.overrideReason}
                </Notice>
              )}
              <ActionForm action={overrideEligibilityAction} className="grid gap-3 border-t border-line pt-4">
                <input type="hidden" name="applicationId" value={app.id} />
                <FormGrid>
                  <Field label="Override the result" htmlFor="ov-value">
                    <Select id="ov-value" name="value" defaultValue={app.eligibilityOverride ?? "met"}>
                      <option value="met">Meets criteria</option>
                      <option value="not_met">Does not meet criteria</option>
                      <option value="clear">Remove override</option>
                    </Select>
                  </Field>
                  <Field label="Reason" htmlFor="ov-reason">
                    <Input id="ov-reason" name="reason" defaultValue={app.overrideReason} />
                  </Field>
                </FormGrid>
                <div>
                  <SubmitButton variant="secondary" size="sm">
                    Save override
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Reviewer scores"
              description={totals.length ? `Average ${round1(average(totals))} out of 100 · spread ${round1(spread(totals))} from ${totals.length} review${totals.length === 1 ? "" : "s"}` : "No reviews submitted yet."}
            />
            <CardBody className="grid gap-4">
              {reviews.length > 0 && (
                <Table>
                  <THead>
                    <tr>
                      <TH>Reviewer</TH>
                      {items.map((i) => (
                        <TH key={i.key} className="text-right">
                          {i.label}
                        </TH>
                      ))}
                      <TH className="text-right">Total</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {reviews.map((r) => (
                      <TR key={r.ra.id}>
                        <TD className="min-w-40">
                          <p className="font-medium">{r.reviewer.name}</p>
                          <p className="text-sm text-muted">{r.ra.submittedAt ? `Submitted ${formatShortDate(r.ra.submittedAt)}` : "Not submitted"}</p>
                          {r.ra.remarks && <p className="mt-1 text-[15px]">{r.ra.remarks}</p>}
                        </TD>
                        {items.map((i) => (
                          <TD key={i.key} className="text-right tabular-nums">
                            {r.ra.scores[i.key] ?? "-"}
                            <span className="text-muted">/{i.maxScore}</span>
                          </TD>
                        ))}
                        <TD className="text-right font-semibold tabular-nums">{r.ra.submittedAt ? round1(weightedTotal(r.ra.scores, items)) : "-"}</TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>
              )}
              <ActionForm action={assignReviewerAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Assign another reviewer" htmlFor="as-reviewer" className="min-w-56 flex-1">
                  <Select id="as-reviewer" name="reviewerId">
                    {reviewerList.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.external ? " (external)" : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <SubmitButton variant="secondary">Assign</SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>

          {sessions.length > 0 && (
            <Card>
              <CardHeader title="Interviews and talks" actions={<Link href={`/admin/positions/${position.id}/evaluations`}>Evaluations</Link>} />
              <CardBody className="p-0 sm:p-0">
                <ul className="divide-y divide-line">
                  {sessions.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                      <span>
                        <span className="block font-medium">{ROUND_LABELS[s.round]}</span>
                        <span className="block text-[15px] text-muted">{formatDual(s.startsAt, tz)}</span>
                      </span>
                      <EventStatusBadge status={s.status} />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}

          <ProfileView snapshot={app.snapshot ?? buildSnapshot(candidate.id)} answers={app.answers} questions={advert?.questions ?? []} />
        </div>

        <div className="grid min-w-0 content-start gap-6">
          <Card>
            <CardHeader title="Status" />
            <CardBody className="grid gap-5">
              <ActionForm action={changeStatusAction} className="grid gap-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Status the candidate sees" htmlFor="st-status">
                  <Select id="st-status" name="status" defaultValue={app.status}>
                    {Object.entries(APPLICATION_STATUS)
                      .filter(([k]) => k !== "draft")
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                  </Select>
                </Field>
                <Field label="Message to the candidate" htmlFor="st-note">
                  <Textarea id="st-note" name="note" rows={2} />
                </Field>
                <Checkbox name="notify" defaultChecked label="Email the candidate" />
                <div>
                  <SubmitButton size="sm">Change status</SubmitButton>
                </div>
              </ActionForm>
              <ActionForm action={setListStatusAction} className="grid gap-3 border-t border-line pt-4">
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Shortlisting list" htmlFor="ls-status">
                  <Select id="ls-status" name="listStatus" defaultValue={app.listStatus}>
                    {Object.entries(LIST_STATUS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Reason (HR only)" htmlFor="ls-reason">
                  <Input id="ls-reason" name="reason" defaultValue={app.listReason} />
                </Field>
                <div>
                  <SubmitButton size="sm" variant="secondary">
                    Save list
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Internal remarks" description="Never shown to the candidate." />
            <CardBody className="grid gap-4">
              <ActionForm action={addNoteAction} className="grid gap-3" resetOnSuccess>
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Add a remark" htmlFor="note-body">
                  <Textarea id="note-body" name="body" rows={3} required />
                </Field>
                <div>
                  <SubmitButton size="sm">Add remark</SubmitButton>
                </div>
              </ActionForm>
              {notes.length > 0 && (
                <ul className="grid gap-3">
                  {notes.map(({ n, by }) => (
                    <li key={n.id} className="rounded-[4px] bg-off px-3 py-2.5">
                      <p className="whitespace-pre-line text-[15px]">{n.body}</p>
                      <p className="mt-1 text-sm text-muted">
                        {by}, {formatDateTime(n.createdAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Rejection reason" />
            <CardBody>
              <ActionForm action={setRejectionAction} className="grid gap-3">
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Reason" htmlFor="rj-reason">
                  <Textarea id="rj-reason" name="reason" rows={2} defaultValue={app.rejectionReason} />
                </Field>
                <Checkbox name="share" defaultChecked={app.shareRejectionReason} label="Share this reason with the candidate" />
                <div>
                  <SubmitButton size="sm" variant="secondary">
                    Save reason
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Documents asked for later" />
            <CardBody className="grid gap-4">
              {requests.length > 0 && (
                <ul className="grid gap-2">
                  {requests.map((r) => {
                    const doc = fulfilledDocs.find((d) => d.id === r.documentId);
                    return (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[15px]">{r.label}</span>
                        {doc ? (
                          <a href={`/api/files/${doc.id}`} target="_blank" rel="noreferrer" className="text-[15px]">
                            Uploaded: {doc.filename}
                          </a>
                        ) : (
                          <Badge tone="warning">Waiting</Badge>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              <ActionForm action={requestDocumentAction} className="grid gap-3" resetOnSuccess>
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Document needed" htmlFor="dr-label" hint="For example: attested PhD degree">
                  <Input id="dr-label" name="label" required />
                </Field>
                <div>
                  <SubmitButton size="sm" variant="secondary">
                    Ask the candidate
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Supporting files" description="Slides, reference checks and document verification." />
            <CardBody className="grid gap-4">
              {attachedDocs.length > 0 && <DocumentList docs={attachedDocs.map((d) => ({ ...d, label: d.label || documentKindLabel(d.kind) }))} />}
              <ActionForm action={uploadSupportingAction} className="grid gap-3" resetOnSuccess>
                <input type="hidden" name="applicationId" value={app.id} />
                <Field label="Kind" htmlFor="sf-kind">
                  <Select id="sf-kind" name="kind">
                    <option value="slides">Presentation slides</option>
                    <option value="reference_check">Reference check</option>
                    <option value="verification">Document verification</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Label" htmlFor="sf-label">
                  <Input id="sf-label" name="label" />
                </Field>
                <Field label="File" htmlFor="sf-file" hint="PDF, JPG or PNG">
                  <Input id="sf-file" name="file" type="file" accept={ACCEPT_ATTR} required className="py-2" />
                </Field>
                <div>
                  <SubmitButton size="sm" variant="secondary" pendingText="Uploading…">
                    Attach file
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="History" />
            <CardBody>
              <ol className="grid gap-3">
                {history.map(({ h, by }) => (
                  <li key={h.id} className="border-l-2 border-teal pl-3">
                    <p className="text-[15px] font-medium">{APPLICATION_STATUS[h.toStatus as keyof typeof APPLICATION_STATUS]?.label ?? h.toStatus}</p>
                    <p className="text-sm text-muted">
                      {formatDateTime(h.createdAt)}
                      {by ? `, ${by}` : ""}
                    </p>
                    {h.note && <p className="text-sm">{h.note}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
