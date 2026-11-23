import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, applications, applicationStatusHistory, documentRequests, documents, events, offers, positions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { advertIsOpen, getProfile } from "@/lib/candidate";
import { APPLICATION_STATUS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { fulfilDocumentRequestAction, withdrawApplicationAction } from "@/actions/candidate";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input } from "@/components/ui/field";
import { ApplicationStatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { DocumentList, ProfileView } from "@/components/applications/profile-view";
import { InvitationCard } from "@/components/candidate/invitation-card";
import { OfferCard } from "@/components/candidate/offer-card";

export const metadata: Metadata = { title: "My application" };

export default async function MyApplicationPage({ params, searchParams }: PageProps<"/me/applications/[id]">) {
  const user = await requireUser(["candidate"]);
  const { id } = await params;
  const sp = await searchParams;
  const row = (await db
    .select({ app: applications, position: positions, advert: adverts })
    .from(applications)
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(adverts, eq(adverts.positionId, positions.id))
    .where(and(eq(applications.id, Number(id)), eq(applications.candidateId, user.id)))
    )[0];
  if (!row || row.app.status === "draft") notFound();
  const { app, position, advert } = row;
  await audit(user.id, "viewed", "application", app.id, "candidate");

  const history = (await db.select().from(applicationStatusHistory).where(eq(applicationStatusHistory.applicationId, app.id)).orderBy(asc(applicationStatusHistory.id)));
  const sessions = (await db.select().from(events).where(eq(events.applicationId, app.id)).orderBy(asc(events.startsAt))).filter((e) => e.status !== "cancelled");
  const requests = (await db.select().from(documentRequests).where(eq(documentRequests.applicationId, app.id)));
  const offer = (await db.select().from(offers).where(eq(offers.applicationId, app.id)))[0];
  const ownAppDocs = (await db.select().from(documents).where(and(eq(documents.applicationId, app.id), eq(documents.uploadedBy, user.id))));
  const profile = await getProfile(user.id);
  const canWithdraw = advertIsOpen(advert) && !["withdrawn", "selected", "not_selected"].includes(app.status);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "My applications", href: "/me" }, { label: app.appNo ?? "Application" }]}
        title={position.title}
        description={`${position.department} · application ${app.appNo} · submitted ${formatDateTime(app.submittedAt)} PKT`}
        meta={<ApplicationStatusBadge status={app.status} />}
      />

      <div className="grid gap-6">
        {sp.submitted && (
          <Notice tone="success" title="Application submitted">
            Your application number is <strong>{app.appNo}</strong>. We&apos;ve emailed you a copy. You&apos;ll see every status change here and by email.
          </Notice>
        )}
        {app.status === "not_selected" && app.shareRejectionReason && app.rejectionReason && (
          <Notice tone="info" title="Feedback from DU">
            {app.rejectionReason}
          </Notice>
        )}

        {offer && <OfferCard offer={offer} positionTitle={position.title} />}

        {requests.length > 0 && (
          <Card>
            <CardHeader title="Documents requested by HR" />
            <CardBody className="grid gap-4">
              {requests.map((r) => (
                <div key={r.id} className="rounded-[10px] border border-line p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{r.label}</p>
                    <Badge tone={r.status === "open" ? "warning" : "success"}>{r.status === "open" ? "Needed" : "Uploaded"}</Badge>
                  </div>
                  {r.status === "open" ? (
                    <ActionForm action={fulfilDocumentRequestAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                      <input type="hidden" name="requestId" value={r.id} />
                      <Field label="File" htmlFor={`req-${r.id}`} hint="PDF, JPG or PNG">
                        <Input id={`req-${r.id}`} name="file" type="file" accept={ACCEPT_ATTR} required className="h-auto py-2" />
                      </Field>
                      <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
                    </ActionForm>
                  ) : (
                    <div className="mt-3">
                      <DocumentList docs={ownAppDocs.filter((d) => d.id === r.documentId)} />
                    </div>
                  )}
                </div>
              ))}
            </CardBody>
          </Card>
        )}

        {sessions.length > 0 && (
          <section aria-labelledby="sessions-h" className="grid gap-4">
            <h2 id="sessions-h" className="text-xl font-semibold">
              Interviews and sessions
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {sessions.map((e) => (
                <InvitationCard key={e.id} event={e} positionTitle={position.title} timezone={profile.timezone} />
              ))}
            </div>
          </section>
        )}

        <Card>
          <CardHeader title="Progress" />
          <CardBody>
            <ol className="grid gap-4">
              {history.map((h, i) => (
                <li key={h.id} className="flex gap-3">
                  <span className={`mt-1.5 size-3 shrink-0 rounded-full ${i === history.length - 1 ? "bg-teal" : "bg-line"}`} aria-hidden />
                  <div>
                    <p className="font-semibold">{APPLICATION_STATUS[h.toStatus as keyof typeof APPLICATION_STATUS]?.label ?? h.toStatus}</p>
                    <p className="text-sm text-muted">{formatDateTime(h.createdAt)} PKT</p>
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>

        <section aria-labelledby="submitted-h" className="grid gap-4">
          <h2 id="submitted-h" className="text-xl font-semibold">
            What you submitted
          </h2>
          {app.snapshot ? (
            <ProfileView snapshot={app.snapshot} answers={app.answers} questions={advert?.questions ?? []} />
          ) : (
            <p className="text-muted">No copy was kept for this application.</p>
          )}
          {ownAppDocs.length > 0 && (
            <Card>
              <CardHeader title="Files for this application" />
              <CardBody>
                <DocumentList docs={ownAppDocs} />
              </CardBody>
            </Card>
          )}
        </section>

        {canWithdraw && (
          <Card>
            <CardHeader title="Withdraw" description="You can withdraw until the closing date. You can't apply for this post again afterwards." />
            <CardBody>
              <ActionForm action={withdrawApplicationAction}>
                <input type="hidden" name="applicationId" value={app.id} />
                <ConfirmButton question="Withdraw this application?" confirmText="Yes, withdraw" size="md">
                  Withdraw application
                </ConfirmButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
