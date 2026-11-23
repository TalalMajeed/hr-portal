import type { Metadata } from "next";
import { and, eq, inArray } from "drizzle-orm";
import { FileDown } from "lucide-react";
import { db } from "@/lib/db";
import { applications, emails, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { getBoardPack } from "@/lib/board";
import { STAFF_ROLES } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { ACCEPT_ATTR } from "@/lib/uploads";
import {
  decisionAction,
  edSignOffAction,
  generatePackAction,
  offerNextAction,
  offerStatusAction,
  saveBoardAction,
  sendOfferAction,
  sendRegretsAction,
} from "@/actions/board";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonAnchor } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ApplicationStatusBadge } from "@/components/ui/status-badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { DocumentList } from "@/components/applications/profile-view";
import { BoardPackView } from "@/components/board/board-pack";

export const metadata: Metadata = { title: "Selection Board" };

const OFFER_TONE = { sent: "warning", accepted: "success", declined: "danger", withdrawn: "neutral" } as const;

export default async function BoardTab({ params }: PageProps<"/admin/positions/[id]/board">) {
  const user = await requireUser(STAFF_ROLES);
  const p = await positionForPage(user, (await params).id);
  const pack = getBoardPack(p.id)!;
  const b = pack.board;
  const isHr = ["hr", "super_admin"].includes(user.role);
  const isEd = ["ed", "super_admin"].includes(user.role);
  const canEdit = isHr || isEd;

  const regretted = new Set(
    db
      .select({ id: emails.applicationId })
      .from(emails)
      .where(and(eq(emails.positionId, p.id), eq(emails.templateKey, "regret")))
      .all()
      .map((e) => e.id),
  );
  const offered = new Set(pack.candidates.filter((c) => c.offer).map((c) => c.applicationId));
  const recommended = new Set(pack.candidates.filter((c) => c.decision?.decision === "recommended").map((c) => c.applicationId));
  const regretPool = db
    .select({ a: applications, name: users.name })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(and(eq(applications.positionId, p.id), inArray(applications.status, ["applied", "under_review", "shortlisted", "interview_scheduled", "talk_scheduled", "not_selected"])))
    .all()
    .filter((r) => !offered.has(r.a.id) && !recommended.has(r.a.id));
  const declined = pack.candidates.some((c) => c.offer?.status === "declined");

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Board meeting" description="Proposed salary and terms go into the pack; minutes are attached after the meeting (H1, H2)." />
          <CardBody>
            <ActionForm action={saveBoardAction} className="grid gap-5">
              <input type="hidden" name="id" value={p.id} />
              <fieldset disabled={!canEdit} className="grid gap-5">
                <FormGrid>
                  <Field label="Meeting date" htmlFor="meetingDate">
                    <Input id="meetingDate" name="meetingDate" type="date" defaultValue={b?.meetingDate} />
                  </Field>
                  <Field label="Proposed salary" htmlFor="proposedSalary">
                    <Input id="proposedSalary" name="proposedSalary" defaultValue={b?.proposedSalary} placeholder="PKR 450,000 a month" />
                  </Field>
                </FormGrid>
                <Field label="Proposed terms" htmlFor="terms">
                  <Textarea id="terms" name="terms" rows={3} defaultValue={b?.terms} />
                </Field>
                <Field label="Minutes" htmlFor="minutes">
                  <Textarea id="minutes" name="minutes" rows={4} defaultValue={b?.minutes} />
                </Field>
                <Field label="Attach signed minutes" htmlFor="minutesFile" hint="PDF, JPG or PNG">
                  <Input id="minutesFile" name="minutesFile" type="file" accept={ACCEPT_ATTR} className="h-auto py-2" />
                </Field>
              </fieldset>
              {pack.minutesDocs.length > 0 && <DocumentList docs={pack.minutesDocs} />}
              {canEdit && (
                <div>
                  <SubmitButton>Save</SubmitButton>
                </div>
              )}
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pack" />
          <CardBody className="grid gap-3">
            {b?.packGeneratedAt ? (
              <p className="text-[15px]">Generated {formatDateTime(b.packGeneratedAt)}. Board members can read it in their portal.</p>
            ) : (
              <p className="text-[15px] text-muted">Not generated yet. Generating it moves the position to stage 10 and emails the Board members.</p>
            )}
            {isHr && (
              <ActionForm action={generatePackAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton variant={b?.packGeneratedAt ? "secondary" : "primary"} pendingText="Generating…">
                  {b?.packGeneratedAt ? "Generate again" : "Generate pack"}
                </SubmitButton>
              </ActionForm>
            )}
            <ButtonAnchor href={`/print/board/${p.id}`} target="_blank" variant="secondary">
              <FileDown aria-hidden /> PDF in DU format
            </ButtonAnchor>
            <ButtonAnchor href={`/api/export/board?position=${p.id}`} variant="secondary">
              <FileDown aria-hidden /> Excel
            </ButtonAnchor>
            {b?.edSignedOffAt ? (
              <Notice tone="success">Signed off by the ED on {formatDate(b.edSignedOffAt)}.</Notice>
            ) : (
              isEd && (
                <ActionForm action={edSignOffAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton pendingText="Signing…">Sign off the Board report</SubmitButton>
                </ActionForm>
              )
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Decisions and offers" description="Record the Board's decision for each candidate, then send offers from the template (H2, H3)." />
        <CardBody className="p-0 sm:p-0">
          {pack.candidates.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No shortlisted candidates yet">Candidates appear here once they are shortlisted and evaluated.</EmptyState>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {pack.candidates.map((c) => (
                <li key={c.applicationId} className="grid gap-4 px-5 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      {c.consensusRank && <Badge tone="teal">Panel rank {c.consensusRank}</Badge>}
                      <ApplicationStatusBadge status={c.status as "applied"} />
                    </div>
                    <a href={`/admin/applications/${c.applicationId}`} className="mt-1 block font-semibold">
                      {c.name}
                    </a>
                    <p className="text-sm text-muted">
                      {c.appNo} · overall {c.overall ? `${c.overall.toFixed(1)}%` : "not scored"}
                    </p>
                    {c.offer && (
                      <div className="mt-3 grid gap-2 rounded-[4px] border border-line bg-off p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={OFFER_TONE[c.offer.status]}>Offer {c.offer.status}</Badge>
                          <span className="text-sm text-muted">sent {formatDate(c.offer.sentAt)}</span>
                          {c.offer.joinedAt && <Badge tone="success">Joined {formatDate(c.offer.joinedAt)}</Badge>}
                        </div>
                        {isHr && (
                          <ActionForm action={offerStatusAction} className="flex flex-wrap items-end gap-2">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="offerId" value={c.offer.id} />
                            {c.offer.status === "sent" && (
                              <>
                                <SubmitButton name="step" value="accepted" size="sm" variant="secondary">
                                  Mark accepted
                                </SubmitButton>
                                <SubmitButton name="step" value="declined" size="sm" variant="secondary">
                                  Mark declined
                                </SubmitButton>
                              </>
                            )}
                            {c.offer.status === "accepted" && !c.offer.joinedAt && (
                              <>
                                <Input name="joinedAt" type="date" aria-label="Joining date" className="h-9 w-44" />
                                <SubmitButton name="step" value="joined" size="sm" variant="secondary">
                                  Mark joined
                                </SubmitButton>
                              </>
                            )}
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="grid gap-3">
                    {canEdit && (
                      <ActionForm action={decisionAction} className="grid gap-3 sm:grid-cols-[1fr_100px] sm:items-end">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="applicationId" value={c.applicationId} />
                        <Field label="Board decision" htmlFor={`d-${c.applicationId}`}>
                          <Select id={`d-${c.applicationId}`} name="decision" defaultValue={c.decision?.decision ?? ""}>
                            <option value="" disabled>
                              Choose
                            </option>
                            <option value="recommended">Recommended</option>
                            <option value="not_recommended">Not recommended</option>
                            <option value="deferred">Deferred</option>
                          </Select>
                        </Field>
                        <Field label="Rank" htmlFor={`r-${c.applicationId}`}>
                          <Input id={`r-${c.applicationId}`} name="rank" type="number" inputMode="numeric" min={1} defaultValue={c.decision?.rank ?? c.consensusRank ?? ""} />
                        </Field>
                        <Field label="Notes" htmlFor={`n-${c.applicationId}`} className="sm:col-span-2">
                          <Input id={`n-${c.applicationId}`} name="notes" defaultValue={c.decision?.notes} />
                        </Field>
                        <div className="sm:col-span-2">
                          <SubmitButton variant="secondary" size="sm">
                            Save decision
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    )}
                    {isHr && c.decision?.decision === "recommended" && !c.offer && (
                      <ActionForm action={sendOfferAction} className="grid gap-3 rounded-[4px] border border-line p-3">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="applicationId" value={c.applicationId} />
                        <Field label="Offer salary" htmlFor={`s-${c.applicationId}`} hint="Leave blank to use the proposed salary">
                          <Input id={`s-${c.applicationId}`} name="salary" placeholder={b?.proposedSalary || "PKR"} />
                        </Field>
                        <div>
                          <ConfirmButton variant="primary" question={`Send the offer to ${c.name}?`} confirmText="Send offer">
                            Send offer letter
                          </ConfirmButton>
                        </div>
                      </ActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {isHr && declined && (
        <Card>
          <CardHeader title="An offer was declined" description="Offer the post to the next recommended candidate by rank (H3)." />
          <CardBody>
            <ActionForm action={offerNextAction}>
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton>Offer to the next candidate</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}

      {isHr && (
        <Card>
          <CardHeader title="Regret emails" description="Send the regret template to unsuccessful candidates in bulk (H4). Candidates who already had one are skipped." />
          <CardBody>
            {regretPool.length === 0 ? (
              <p className="text-muted">No unsuccessful candidates to contact.</p>
            ) : (
              <ActionForm action={sendRegretsAction} className="grid gap-4">
                <input type="hidden" name="id" value={p.id} />
                <ul className="grid gap-2 sm:grid-cols-2">
                  {regretPool.map(({ a, name }) => (
                    <li key={a.id}>
                      <Checkbox
                        name="applicationIds"
                        value={a.id}
                        defaultChecked={!regretted.has(a.id) && ["not_selected"].includes(a.status)}
                        disabled={regretted.has(a.id)}
                        label={name}
                        hint={`${a.appNo}${regretted.has(a.id) ? " · regret already sent" : ""}`}
                      />
                    </li>
                  ))}
                </ul>
                <Checkbox name="includeReason" label="Include the rejection reason where HR chose to share it" />
                <div>
                  <ConfirmButton variant="primary" question="Send regret emails to the selected candidates?" confirmText="Send">
                    Send regret emails
                  </ConfirmButton>
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Pack preview" />
        <CardBody>
          <BoardPackView pack={pack} />
        </CardBody>
      </Card>
    </div>
  );
}
