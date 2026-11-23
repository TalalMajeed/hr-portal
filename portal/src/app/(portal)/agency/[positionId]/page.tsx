import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, applications, positions, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { advertIsOpen } from "@/lib/candidate";
import { DEGREE_LEVELS } from "@/lib/constants";
import { formatDateTime, formatShortDate } from "@/lib/format";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { uploadAgencyCandidateAction } from "@/actions/agency";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ApplicationStatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { AgencyCandidateForm } from "@/components/candidate/agency-form";

export const metadata: Metadata = { title: "Add candidates" };

export default async function AgencyPositionPage({ params }: PageProps<"/agency/[positionId]">) {
  const user = await requireUser(["agency"]);
  const { positionId } = await params;
  const row = (await db
    .select({ p: positions, a: adverts })
    .from(positions)
    .innerJoin(adverts, eq(adverts.positionId, positions.id))
    .where(eq(positions.id, Number(positionId)))
    )[0];
  if (!row || !row.a.publishedAt) notFound();
  const { p, a } = row;
  const open = advertIsOpen(a);
  const uploads = (await db
    .select({ app: applications, candidate: users })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(and(eq(applications.positionId, p.id), eq(applications.agencyId, user.id)))
    .orderBy(desc(applications.id))
    );

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Open positions", href: "/agency" }, { label: p.code }]}
        title={p.title}
        description={`${p.department} · ${p.grade} · closes ${formatDateTime(a.closingAt)} PKT`}
      />
      <div className="grid gap-6">
        {open ? (
          <Card>
            <CardHeader title="Add a candidate" description="DU checks each candidate against the post's criteria and for duplicates with direct applications." />
            <CardBody>
              <AgencyCandidateForm positionId={p.id} action={uploadAgencyCandidateAction} levels={DEGREE_LEVELS} accept={ACCEPT_ATTR} />
            </CardBody>
          </Card>
        ) : (
          <Notice tone="warning" title="This position is closed">
            You can no longer add candidates. The ones you added are listed below.
          </Notice>
        )}

        <section aria-labelledby="uploads-h">
          <h2 id="uploads-h" className="mb-3 text-xl font-semibold">
            Your candidates ({uploads.length})
          </h2>
          {uploads.length === 0 ? (
            <p className="text-muted">You haven&apos;t added anyone for this position yet.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Candidate</TH>
                  <TH>Application number</TH>
                  <TH>Added</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <tbody>
                {uploads.map(({ app, candidate }) => (
                  <TR key={app.id}>
                    <TD className="min-w-48">
                      <span className="font-semibold">{candidate.name}</span>
                      <span className="block text-sm text-muted">{candidate.phone}</span>
                      {app.duplicateOfId && (
                        <Badge tone="warning" className="mt-1">
                          Possible duplicate
                        </Badge>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap tabular-nums">{app.appNo}</TD>
                    <TD className="whitespace-nowrap">{formatShortDate(app.submittedAt)}</TD>
                    <TD>
                      <ApplicationStatusBadge status={app.status} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
