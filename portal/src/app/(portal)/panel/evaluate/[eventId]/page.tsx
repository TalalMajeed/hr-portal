import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { evaluations, events } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getDoc } from "@/lib/positions";
import { eventPanelists, loadEvent } from "@/lib/scheduling";
import { belowMinimum, weightedTotal } from "@/lib/scoring";
import { RECOMMENDATION_LABELS, ROUND_LABELS } from "@/lib/constants";
import { formatDateTime, round1 } from "@/lib/format";
import { saveEvaluationAction } from "@/actions/evaluations";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { RecommendationBadge } from "@/components/ui/status-badge";
import { ScoreFields } from "@/components/evaluations/score-fields";

export const metadata: Metadata = { title: "Evaluation" };

export default async function EvaluatePage({ params }: PageProps<"/panel/evaluate/[eventId]">) {
  const user = await requireUser(["panel"]);
  const { eventId } = await params;
  const e = db.select().from(events).where(eq(events.id, Number(eventId))).get();
  if (!e || !eventPanelists(e).some((m) => m.user.id === user.id)) notFound();
  const r = loadEvent(e.id)!;
  const items = getDoc(e.positionId, "rubric")?.[e.round] ?? [];
  const ev = db.select().from(evaluations).where(and(eq(evaluations.eventId, e.id), eq(evaluations.panelistId, user.id))).get();
  const locked = ev?.status === "submitted";
  const cancelled = ["cancelled", "declined"].includes(e.status);
  audit(user.id, "viewed", "evaluation", e.id);
  const low = ev ? belowMinimum(ev.scores, items) : [];

  return (
    <>
      <PageHeader
        crumbs={[{ label: "My panels", href: "/panel" }, { label: "Evaluation" }]}
        title={r.candidate.name}
        description={`${ROUND_LABELS[e.round]} · ${r.position.title} · ${formatDateTime(e.startsAt)} PKT`}
      />
      <div className="mx-auto grid max-w-2xl gap-5">
        {(e.topic || e.brief) && (
          <Notice title={e.round === "talk" ? "Talk" : "Presentation brief"}>
            {e.topic && <p>Topic: {e.topic}</p>}
            {e.audience && <p>Audience: {e.audience}</p>}
            {e.brief && <p>{e.brief}</p>}
          </Notice>
        )}
        {ev?.status === "reopened" && (
          <Notice tone="warning" title="The ED reopened this evaluation">
            {ev.reopenReason}
          </Notice>
        )}
        {cancelled && <Notice tone="error">This session was cancelled, so there is nothing to evaluate.</Notice>}
        {locked && (
          <Notice tone="success" title={`Submitted ${formatDateTime(ev!.submittedAt)}`}>
            Total {round1(weightedTotal(ev!.scores, items))} out of 100. <RecommendationBadge value={ev!.recommendation} />
          </Notice>
        )}
        <p className="text-[15px]">
          <Link href={`/panel/candidates/${r.app.id}`}>Open the candidate&apos;s file</Link>
        </p>
        <ActionForm action={saveEvaluationAction} className="grid gap-5">
          <input type="hidden" name="eventId" value={e.id} />
          <Card>
            <CardHeader title="Scores" description={`${ROUND_LABELS[e.round]} rubric`} />
            <CardBody className="grid gap-3">
              <ScoreFields items={items} scores={ev?.scores ?? {}} disabled={locked || cancelled} />
              {low.length > 0 && <p className="text-[15px] text-warning">Below the minimum: {low.map((i) => i.label).join(", ")}.</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Comments" />
            <CardBody className="grid gap-4">
              <Field label="Strengths" htmlFor="strengths">
                <Textarea id="strengths" name="strengths" rows={4} defaultValue={ev?.strengths} disabled={locked || cancelled} />
              </Field>
              <Field label="Concerns" htmlFor="concerns">
                <Textarea id="concerns" name="concerns" rows={4} defaultValue={ev?.concerns} disabled={locked || cancelled} />
              </Field>
              <fieldset className="grid gap-2" disabled={locked || cancelled}>
                <legend className="mb-1 text-[15px] font-medium">Recommendation</legend>
                {Object.entries(RECOMMENDATION_LABELS).map(([k, v]) => (
                  <label key={k} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[4px] border border-line bg-white px-3 has-[:checked]:border-teal has-[:checked]:bg-tint">
                    <input type="radio" name="recommendation" value={k} defaultChecked={ev?.recommendation === k} className="size-5 accent-teal" />
                    <span className="text-base">{v.label}</span>
                  </label>
                ))}
              </fieldset>
            </CardBody>
          </Card>
          {!locked && !cancelled && (
            <div className="grid gap-3 sm:flex sm:flex-wrap">
              <SubmitButton name="intent" value="draft" variant="secondary" className="w-full sm:w-auto">
                Save draft
              </SubmitButton>
              <ConfirmButton name="intent" value="submit" variant="primary" size="md" question="Submit and lock?" confirmText="Submit evaluation">
                Submit evaluation
              </ConfirmButton>
            </div>
          )}
        </ActionForm>
      </div>
    </>
  );
}
