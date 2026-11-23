import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { ExternalLink, FileDown, Image as ImageIcon } from "lucide-react";
import { db } from "@/lib/db";
import { adverts, advertRuns } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { closeExpiredAdverts } from "@/lib/adverts";
import { AD_CHANNELS, STAFF_ROLES } from "@/lib/constants";
import { formatDateTime, formatShortDate, isoToPktInput } from "@/lib/format";
import { addAdvertRunAction, advertLifecycleAction, closingRemindersAction, advertStatusAction, generateAdvertAction, saveAdvertAction } from "@/actions/adverts";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonAnchor } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { AdvertBadge } from "@/components/ui/status-badge";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ApprovalTrail } from "@/components/positions/approval-trail";

export const metadata: Metadata = { title: "Advert" };

export default async function AdvertPage({ params }: PageProps<"/admin/positions/[id]/advert">) {
  const user = await requireUser(STAFF_ROLES);
  const p = await positionForPage(user, (await params).id);
  await closeExpiredAdverts();
  const ad = (await db.select().from(adverts).where(eq(adverts.positionId, p.id)))[0];
  const runs = (await db.select().from(advertRuns).where(eq(advertRuns.positionId, p.id)).orderBy(desc(advertRuns.runDate)));
  const isHr = ["hr", "super_admin"].includes(user.role);
  const isEd = ["ed", "super_admin"].includes(user.role);

  if (!ad) {
    return p.approvalStatus !== "approved" ? (
      <EmptyState title="Not ready to advertise">The ED has to approve the position first. Send it for approval from the Overview tab.</EmptyState>
    ) : (
      <EmptyState
        title="No ad yet"
        action={
          isHr ? (
            <ActionForm action={generateAdvertAction}>
              <input type="hidden" name="id" value={p.id} />
              <SubmitButton pendingText="Generating…">Generate the ad from the JD</SubmitButton>
            </ActionForm>
          ) : undefined
        }
      >
        HR builds the ad in DU format from the approved job description and criteria, edits it, and sends it to the ED to approve.
      </EmptyState>
    );
  }

  type Step = { step: string; label: string; variant?: "primary" | "secondary" | "danger"; who: boolean };
  const allSteps: Step[] = [
    { step: "submit", label: "Send to ED for approval", who: isHr && ["draft", "unpublished"].includes(ad.status) },
    { step: "approve", label: "Approve and publish", who: isEd && ad.status === "pending_approval" },
    { step: "return", label: "Return to HR", variant: "danger", who: isEd && ad.status === "pending_approval" },
    { step: "unpublish", label: "Unpublish", variant: "secondary", who: isHr && ad.status === "published" },
    { step: "republish", label: "Publish again", who: isHr && ad.status === "unpublished" },
    { step: "close", label: "Close now", variant: "secondary", who: isHr && ["published", "unpublished"].includes(ad.status) },
    { step: "archive", label: "Archive", variant: "secondary", who: isHr && ad.status === "closed" },
  ];
  const statusSteps = allSteps.filter((s) => s.who);

  const editable = isHr && !["published", "archived"].includes(ad.status);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 gap-6">
        <Card>
          <CardHeader
            title="Status"
            actions={<AdvertBadge status={ad.status} />}
            description={
              ad.status === "published"
                ? `On the careers page. Closes ${formatDateTime(ad.closingAt)} PKT.`
                : ad.status === "closed"
                  ? `Closed ${formatDateTime(ad.closingAt)} PKT. No new applications.`
                  : `Closing date ${formatDateTime(ad.closingAt)} PKT.`
            }
          />
          <CardBody className="grid gap-5">
            <ApprovalTrail positionId={p.id} subject="advert" />
            {statusSteps.length > 0 && (
              <ActionForm action={advertStatusAction} className="grid gap-3 border-t border-line pt-5">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Comment" htmlFor="ad-comment" hint="Required when returning">
                  <Input id="ad-comment" name="comment" />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {statusSteps.map((s) => (
                    <SubmitButton key={s.step} name="step" value={s.step} variant={s.variant ?? "primary"}>
                      {s.label}
                    </SubmitButton>
                  ))}
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Ad text and settings"
            description="Generated from the JD in DU format (B1). Questions and extra uploads appear on the application form (C5)."
            actions={
              editable && (
                <ActionForm action={generateAdvertAction} showSuccess={false}>
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="ghost" size="sm" pendingText="Rebuilding…">
                    Rebuild from JD
                  </SubmitButton>
                </ActionForm>
              )
            }
          />
          <CardBody>
            {!editable && ad.status === "published" && <Notice className="mb-5">Unpublish the ad to edit it.</Notice>}
            <ActionForm action={saveAdvertAction} className="grid gap-5">
              <input type="hidden" name="id" value={p.id} />
              <fieldset disabled={!editable} className="grid gap-5">
                <Field label="Ad text" htmlFor="body">
                  <Textarea id="body" name="body" rows={16} defaultValue={ad.body} className="font-sans" />
                </Field>
                <FormGrid>
                  <Field label="Closing date and time (PKT)" htmlFor="closingAt" hint="The post closes by itself at this time">
                    <Input id="closingAt" name="closingAt" type="datetime-local" defaultValue={isoToPktInput(ad.closingAt)} required />
                  </Field>
                  <Field label="If a mandatory criterion isn't met" htmlFor="eligibilityMode">
                    <Select id="eligibilityMode" name="eligibilityMode" defaultValue={p.eligibilityMode}>
                      <option value="flag">Let it through, flagged</option>
                      <option value="block">Block the application</option>
                    </Select>
                  </Field>
                  <Field label="Questions for this post" htmlFor="questions" hint="One per line. End a line with * to make it required.">
                    <Textarea id="questions" name="questions" rows={4} defaultValue={ad.questions.map((q) => `${q.label}${q.required ? " *" : ""}`).join("\n")} />
                  </Field>
                  <Field label="Extra uploads for this post" htmlFor="extraUploads" hint="One per line. End a line with * to make it required.">
                    <Textarea id="extraUploads" name="extraUploads" rows={4} defaultValue={ad.extraUploads.map((q) => `${q.label}${q.required ? " *" : ""}`).join("\n")} />
                  </Field>
                </FormGrid>
              </fieldset>
              {editable && (
                <div>
                  <SubmitButton>Save ad</SubmitButton>
                </div>
              )}
            </ActionForm>
          </CardBody>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader title="Export" description="For newspapers, LinkedIn and social media (B5)." />
          <CardBody className="grid gap-2">
            <ButtonAnchor href={`/print/advert/${p.id}`} target="_blank" variant="secondary">
              <FileDown aria-hidden /> PDF for print
            </ButtonAnchor>
            <ButtonAnchor href={`/api/advert/${p.id}/image`} download={`${p.code}-advert.png`} variant="secondary">
              <ImageIcon aria-hidden /> Image for social media
            </ButtonAnchor>
            {ad.status === "published" && isHr && (
              <ActionForm action={closingRemindersAction}>
                <input type="hidden" name="id" value={p.id} />
                <SubmitButton variant="ghost" pendingText="Sending…">
                  Remind unfinished applicants
                </SubmitButton>
              </ActionForm>
            )}
            {ad.status === "published" && (
              <ButtonAnchor href={`/careers/${p.code}`} target="_blank" variant="ghost">
                <ExternalLink aria-hidden /> View on careers page
              </ButtonAnchor>
            )}
          </CardBody>
        </Card>

        {isHr && (
          <Card>
            <CardHeader title="Where it ran" />
            <CardBody className="grid gap-4">
              {runs.length > 0 && (
                <ul className="grid gap-2 text-[15px]">
                  {runs.map((r) => (
                    <li key={r.id}>
                      <span className="font-semibold">{r.channel}</span> <span className="text-muted">· {formatShortDate(r.runDate)}</span>
                      {r.notes && <p className="text-muted">{r.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
              <ActionForm action={addAdvertRunAction} className="grid gap-3 border-t border-line pt-4" resetOnSuccess>
                <input type="hidden" name="id" value={p.id} />
                <Field label="Channel" htmlFor="channel">
                  <Select id="channel" name="channel" defaultValue="">
                    <option value="" disabled>
                      Choose
                    </option>
                    {AD_CHANNELS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Date it ran" htmlFor="runDate">
                  <Input id="runDate" name="runDate" type="date" />
                </Field>
                <Field label="Notes" htmlFor="notes">
                  <Input id="notes" name="notes" placeholder="Page, edition, link" />
                </Field>
                <div>
                  <SubmitButton variant="secondary" size="sm">
                    Record
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        {(isHr || isEd) && p.status !== "withdrawn" && (
          <Card>
            <CardHeader title="Extend, re-advertise or withdraw" description="The reason goes into the position's history (B7)." />
            <CardBody>
              <ActionForm action={advertLifecycleAction} className="grid gap-3">
                <input type="hidden" name="id" value={p.id} />
                <Field label="New closing date (PKT)" htmlFor="lc-closing" hint="For extending or re-advertising">
                  <Input id="lc-closing" name="closingAt" type="datetime-local" />
                </Field>
                <Field label="Reason" htmlFor="lc-reason">
                  <Textarea id="lc-reason" name="reason" rows={2} required />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="kind" value="extend" variant="secondary" size="sm">
                    Extend
                  </SubmitButton>
                  <SubmitButton name="kind" value="readvertise" variant="secondary" size="sm">
                    Re-advertise
                  </SubmitButton>
                  <ConfirmButton name="kind" value="withdraw" question="Withdraw this position?" confirmText="Withdraw">
                    Withdraw position
                  </ConfirmButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </div>
  );
}
