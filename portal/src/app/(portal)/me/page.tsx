import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { adverts, applications, documentRequests, emails, events, offers, positions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getProfile, invitationCutoff, profileDocuments } from "@/lib/candidate";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ApplicationStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { InvitationCard } from "@/components/candidate/invitation-card";
import { OfferCard } from "@/components/candidate/offer-card";

export const metadata: Metadata = { title: "My applications" };

export default async function CandidateDashboard() {
  const user = await requireUser(["candidate"]);
  const profile = await getProfile(user.id);
  const apps = (await db
    .select({ app: applications, position: positions, advert: adverts })
    .from(applications)
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .leftJoin(adverts, eq(adverts.positionId, positions.id))
    .where(eq(applications.candidateId, user.id))
    .orderBy(desc(applications.updatedAt))
    );
  const appIds = apps.map((a) => a.app.id);
  const titleOf = (applicationId: number) => apps.find((a) => a.app.id === applicationId)?.position.title ?? "";

  const invitations = appIds.length
    ? (await db
        .select()
        .from(events)
        .where(and(inArray(events.applicationId, appIds), ne(events.status, "cancelled")))
        .orderBy(events.startsAt)
        )
        .filter((e) => e.startsAt > invitationCutoff() && e.status !== "completed")
    : [];
  const myOffers = appIds.length ? (await db.select().from(offers).where(inArray(offers.applicationId, appIds))) : [];
  const requests = appIds.length
    ? (await db.select().from(documentRequests).where(and(inArray(documentRequests.applicationId, appIds), eq(documentRequests.status, "open"))))
    : [];
  const messages = (await db.select().from(emails).where(eq(emails.toUserId, user.id)).orderBy(desc(emails.id)).limit(10));

  const missing: string[] = [];
  if (!profile.cnic || !profile.dateOfBirth) missing.push("personal details");
  if (!profile.education.length) missing.push("qualifications");
  if (!(await profileDocuments(user.id)).some((d) => d.kind === "cv")) missing.push("your CV");

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Your applications, invitations and messages from DU HR."
        actions={<ButtonLink href="/careers">Browse jobs</ButtonLink>}
      />

      <div className="grid gap-6">
        {missing.length > 0 && (
          <Notice tone="warning" title="Finish your profile before you apply">
            Add {missing.join(", ")}. <Link href="/me/profile">Go to my profile</Link>
          </Notice>
        )}
        {requests.length > 0 && (
          <Notice tone="warning" title={`HR has asked for ${requests.length === 1 ? "a document" : `${requests.length} documents`}`}>
            <ul className="mt-1 grid gap-1">
              {requests.map((r) => (
                <li key={r.id}>
                  {r.label} for <Link href={`/me/applications/${r.applicationId}`}>{titleOf(r.applicationId)}</Link>
                </li>
              ))}
            </ul>
          </Notice>
        )}

        {myOffers.length > 0 && (
          <section aria-labelledby="offers-h" className="grid gap-4">
            <h2 id="offers-h" className="text-xl font-semibold">
              Offers
            </h2>
            {myOffers.map((o) => (
              <OfferCard key={o.id} offer={o} positionTitle={titleOf(o.applicationId)} />
            ))}
          </section>
        )}

        {invitations.length > 0 && (
          <section aria-labelledby="inv-h" className="grid gap-4">
            <h2 id="inv-h" className="text-xl font-semibold">
              Invitations
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {invitations.map((e) => (
                <InvitationCard key={e.id} event={e} positionTitle={titleOf(e.applicationId)} timezone={profile.timezone} />
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="apps-h">
          <h2 id="apps-h" className="mb-3 text-xl font-semibold">
            Applications
          </h2>
          {apps.length === 0 ? (
            <EmptyState title="You haven't applied yet" action={<ButtonLink href="/careers">See open positions</ButtonLink>}>
              Your profile is reused for every application, so applying takes a few minutes once it&apos;s complete.
            </EmptyState>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Position</TH>
                  <TH>Application number</TH>
                  <TH>Submitted</TH>
                  <TH>Status</TH>
                  <TH>
                    <span className="sr-only">Open</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {apps.map(({ app, position }) => {
                  const href = app.status === "draft" ? `/me/apply/${position.code}` : `/me/applications/${app.id}`;
                  return (
                    <TR key={app.id}>
                      <TD className="min-w-56">
                        <Link href={href} className="font-semibold">
                          {position.title}
                        </Link>
                        <span className="block text-sm text-muted">{position.department}</span>
                      </TD>
                      <TD className="whitespace-nowrap tabular-nums">{app.appNo ?? "Not submitted"}</TD>
                      <TD className="whitespace-nowrap">{app.submittedAt ? formatShortDate(app.submittedAt) : "Draft"}</TD>
                      <TD>
                        <ApplicationStatusBadge status={app.status} />
                      </TD>
                      <TD className="text-right">
                        <Link href={href} className="inline-flex items-center gap-1 whitespace-nowrap text-[15px] font-semibold no-underline">
                          {app.status === "draft" ? "Continue" : "View"} <ChevronRight className="size-4" aria-hidden />
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
        </section>

        <Card>
          <CardHeader title="Messages" description="Every email DU has sent you, newest first." />
          <CardBody className="p-0 sm:p-0">
            {messages.length === 0 ? (
              <p className="px-5 py-5 text-muted sm:px-6">No messages yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {messages.map((m) => (
                  <li key={m.id}>
                    <details className="group px-5 py-3 sm:px-6">
                      <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2">
                        <span className="min-w-0 font-semibold group-open:text-teal">{m.subject}</span>
                        <span className="text-sm text-muted">{formatDateTime(m.createdAt)}</span>
                      </summary>
                      <p className="mt-2 whitespace-pre-line break-words text-[15px]">{m.body}</p>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
