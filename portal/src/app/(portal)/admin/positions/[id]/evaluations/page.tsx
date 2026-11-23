import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { consensus } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { chairFor, expectedEvaluations, roundsWithEvents, scoreSheet } from "@/lib/evaluations";
import { weightedTotal } from "@/lib/scoring";
import { isPast } from "@/lib/scheduling";
import { ROUND_LABELS, STAFF_ROLES } from "@/lib/constants";
import { formatDateTime, round1 } from "@/lib/format";
import { reopenEvaluationAction, sendEvaluationRemindersAction } from "@/actions/evaluations";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RecommendationBadge } from "@/components/ui/status-badge";
import { ConsensusForm } from "@/components/evaluations/consensus-form";

export const metadata: Metadata = { title: "Evaluations" };

export default async function EvaluationsPage({ params }: PageProps<"/admin/positions/[id]/evaluations">) {
  const user = await requireUser(STAFF_ROLES);
  const { id } = await params;
  const position = await positionForPage(user, id);
  const rounds = roundsWithEvents(position.id);
  const isEd = ["ed", "super_admin"].includes(user.role);
  const missing = expectedEvaluations(position.id).filter((r) => r.evaluation?.status !== "submitted");
  const overdue = missing.filter((r) => isPast(r.event.startsAt));

  if (!rounds.length) return <EmptyState title="No sessions yet">Evaluations appear once interviews, talks or second rounds are scheduled.</EmptyState>;

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader
          title="Who still has to submit"
          description={missing.length ? `${missing.length} open, ${overdue.length} for sessions that have already happened` : "Every evaluation is in."}
          actions={
            overdue.length > 0 && (
              <ActionForm action={sendEvaluationRemindersAction}>
                <input type="hidden" name="positionId" value={position.id} />
                <SubmitButton size="sm" pendingText="Sending…">
                  Send reminders
                </SubmitButton>
              </ActionForm>
            )
          }
        />
        {missing.length > 0 && (
          <CardBody className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {missing.map((m) => (
                <li key={`${m.event.id}-${m.panelist.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
                  <span>
                    <span className="block font-medium">{m.panelist.name}</span>
                    <span className="block text-[15px] text-muted">
                      {ROUND_LABELS[m.event.round]} with {m.candidate.name} · {formatDateTime(m.event.startsAt)} PKT
                    </span>
                  </span>
                  <Badge tone={m.evaluation?.status === "reopened" ? "danger" : m.evaluation ? "warning" : "neutral"}>
                    {m.evaluation?.status === "reopened" ? "Reopened" : m.evaluation ? "Draft" : "Not started"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardBody>
        )}
      </Card>

      {rounds.map((round) => {
        const sheet = scoreSheet(position.id, round);
        const chair = chairFor(position.id, round);
        const cons = db.select().from(consensus).where(and(eq(consensus.positionId, position.id), eq(consensus.round, round))).get() ?? null;
        return (
          <section key={round} className="grid gap-4">
            <h2 className="text-xl font-semibold">{ROUND_LABELS[round]}</h2>
            <Card>
              <CardHeader title="Consolidated score sheet" description="Weighted totals out of 100 from submitted evaluations, ranked by the average." />
              <CardBody className="grid gap-4">
                <Table>
                  <THead>
                    <tr>
                      <TH className="text-right">Rank</TH>
                      <TH>Candidate</TH>
                      {sheet.panelists.map((p) => (
                        <TH key={p.id} className="text-right">
                          {p.name}
                        </TH>
                      ))}
                      <TH className="text-right">Average</TH>
                      <TH className="text-right">Submitted</TH>
                    </tr>
                  </THead>
                  <tbody>
                    {sheet.rows.map((r) => (
                      <TR key={r.app.id}>
                        <TD className="text-right font-semibold tabular-nums">{r.rank ?? "-"}</TD>
                        <TD className="min-w-44">
                          <Link href={`/admin/applications/${r.app.id}`} className="font-semibold">
                            {r.candidate.name}
                          </Link>
                          <p className="text-sm text-muted">{r.app.appNo}</p>
                        </TD>
                        {sheet.panelists.map((p) => {
                          const v = r.memberTotals[p.id];
                          const inRow = r.rows.some((x) => x.panelist.id === p.id);
                          return (
                            <TD key={p.id} className="text-right tabular-nums">
                              {!inRow ? <span className="text-muted">Excluded</span> : v === null || v === undefined ? <span className="text-muted">Pending</span> : round1(v)}
                            </TD>
                          );
                        })}
                        <TD className="text-right font-semibold tabular-nums">{round1(r.total) || "-"}</TD>
                        <TD className="text-right tabular-nums">
                          {r.submittedCount}/{r.expectedCount}
                        </TD>
                      </TR>
                    ))}
                  </tbody>
                </Table>

                {sheet.rows.map((r) => (
                  <details key={r.app.id} className="rounded-[10px] border border-line">
                    <summary className="cursor-pointer px-4 py-3 font-semibold">
                      {r.candidate.name}: scores and comments side by side
                    </summary>
                    <div className="grid gap-4 border-t border-line p-4 md:grid-cols-2 xl:grid-cols-3">
                      {r.rows.map((x) => (
                        <div key={x.panelist.id} className="grid content-start gap-2 rounded-[4px] bg-off p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold">
                              {x.panelist.name}
                              {x.isChair ? " (chair)" : ""}
                            </p>
                            {x.evaluation?.status === "submitted" ? <RecommendationBadge value={x.evaluation.recommendation} /> : <Badge>Not submitted</Badge>}
                          </div>
                          {x.evaluation && (
                            <>
                              <ul className="grid gap-1 text-[15px]">
                                {sheet.items.map((it) => (
                                  <li key={it.key} className="flex justify-between gap-2">
                                    <span>{it.label}</span>
                                    <span className="tabular-nums">
                                      {x.evaluation!.scores[it.key] ?? "-"}/{it.maxScore}
                                    </span>
                                  </li>
                                ))}
                                <li className="flex justify-between gap-2 border-t border-line pt-1 font-semibold">
                                  <span>Weighted total</span>
                                  <span className="tabular-nums">{round1(weightedTotal(x.evaluation.scores, sheet.items)) || "-"}</span>
                                </li>
                              </ul>
                              {x.evaluation.strengths && (
                                <p className="text-[15px]">
                                  <span className="font-medium">Strengths: </span>
                                  {x.evaluation.strengths}
                                </p>
                              )}
                              {x.evaluation.concerns && (
                                <p className="text-[15px]">
                                  <span className="font-medium">Concerns: </span>
                                  {x.evaluation.concerns}
                                </p>
                              )}
                              {x.evaluation.status === "submitted" && isEd && (
                                <details>
                                  <summary className="cursor-pointer text-[15px] font-semibold text-teal">Reopen</summary>
                                  <ActionForm action={reopenEvaluationAction} className="mt-2 grid gap-2">
                                    <input type="hidden" name="evaluationId" value={x.evaluation.id} />
                                    <Field label="Reason" htmlFor={`ro-${x.evaluation.id}`}>
                                      <Input id={`ro-${x.evaluation.id}`} name="reason" required />
                                    </Field>
                                    <div>
                                      <SubmitButton size="sm" variant="secondary">
                                        Reopen evaluation
                                      </SubmitButton>
                                    </div>
                                  </ActionForm>
                                </details>
                              )}
                              {x.evaluation.status === "reopened" && <p className="text-[15px] text-warning">Reopened: {x.evaluation.reopenReason}</p>}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
              </CardBody>
            </Card>

            <Card>
              <CardHeader title="Consensus and ranked recommendation" description={chair ? `Signed off by the panel chair, ${chair.name}.` : "Mark a chair on the panel so they can sign off."} />
              <CardBody>
                <ConsensusForm
                  positionId={position.id}
                  round={round}
                  rows={sheet.rows.map((r) => ({ appId: r.app.id, name: r.candidate.name, total: r.total, rank: r.rank }))}
                  existing={cons}
                  canEdit
                  isChair={chair?.id === user.id}
                  chairName={chair?.name}
                />
              </CardBody>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
