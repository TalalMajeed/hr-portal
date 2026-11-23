import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, applications, positions, reviewAssignments } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getDoc } from "@/lib/positions";
import { weightedTotal } from "@/lib/scoring";
import { formatDateTime, round1 } from "@/lib/format";
import { saveReviewAction } from "@/actions/reviews";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { EligibilityBadge } from "@/components/ui/status-badge";
import { ProfileView } from "@/components/applications/profile-view";
import { ScoreFields } from "@/components/evaluations/score-fields";
import { isEligible } from "@/lib/eligibility";

export const metadata: Metadata = { title: "Review application" };

export default async function ReviewPage({ params }: PageProps<"/review/[assignmentId]">) {
  const user = await requireUser(["reviewer"]);
  const { assignmentId } = await params;
  const ra = (await db.select().from(reviewAssignments).where(eq(reviewAssignments.id, Number(assignmentId))))[0];
  if (!ra || ra.reviewerId !== user.id) notFound();
  const app = (await db.select().from(applications).where(eq(applications.id, ra.applicationId)))[0]!;
  const position = (await db.select().from(positions).where(eq(positions.id, app.positionId)))[0]!;
  const advert = (await db.select().from(adverts).where(eq(adverts.positionId, position.id)))[0];
  const items = (await getDoc(position.id, "rubric"))?.shortlisting ?? [];
  const criteria = (await getDoc(position.id, "criteria"))?.items ?? [];
  await audit(user.id, "viewed", "application", app.id, `review ${ra.id}`);
  const locked = !!ra.submittedAt;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "My reviews", href: "/review" }, { label: app.appNo ?? "" }]}
        title={app.snapshot?.name ?? "Application"}
        description={`${position.title} · ${app.appNo}`}
        meta={<EligibilityBadge passed={isEligible(app)} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="order-2 min-w-0 lg:order-1">{app.snapshot && <ProfileView snapshot={app.snapshot} answers={app.answers} questions={advert?.questions ?? []} />}</div>
        <div className="order-1 grid min-w-0 content-start gap-6 lg:order-2 lg:sticky lg:top-6">
          {criteria.length > 0 && (
            <Card>
              <CardHeader title="Criteria for this post" />
              <CardBody>
                <ul className="grid gap-1.5 text-[15px]">
                  {criteria.map((c) => (
                    <li key={c.key}>
                      {c.label} <span className="text-muted">({c.mandatory ? "mandatory" : "desirable"})</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader
              title="Your scores"
              description={locked ? `Submitted ${formatDateTime(ra.submittedAt)}. Total ${round1(weightedTotal(ra.scores, items))} out of 100.` : "Save a draft at any time. Submitting locks your review."}
            />
            <CardBody>
              {locked && <Notice tone="success" className="mb-4">Review submitted. Ask HR if anything needs changing.</Notice>}
              <ActionForm action={saveReviewAction} className="grid gap-4">
                <input type="hidden" name="assignmentId" value={ra.id} />
                <ScoreFields items={items} scores={ra.scores} disabled={locked} />
                <Field label="Remarks" htmlFor="remarks">
                  <Textarea id="remarks" name="remarks" rows={4} defaultValue={ra.remarks} disabled={locked} />
                </Field>
                {!locked && (
                  <div className="flex flex-wrap gap-2">
                    <SubmitButton name="intent" value="draft" variant="secondary">
                      Save draft
                    </SubmitButton>
                    <ConfirmButton name="intent" value="submit" variant="primary" size="md" question="Submit and lock?" confirmText="Submit review">
                      Submit review
                    </ConfirmButton>
                  </div>
                )}
              </ActionForm>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
