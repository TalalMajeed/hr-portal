import { and, asc, eq, inArray } from "drizzle-orm";
import { Check, Minus, X } from "lucide-react";
import { db } from "@/lib/db";
import { applications, conflicts, panelAvailability, panelMembers, panels, panelSlots, users } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth";
import { ROUND_LABELS } from "@/lib/constants";
import { formatDateTime, formatShortDate } from "@/lib/format";
import {
  addMemberAction,
  addSlotAction,
  deleteSlotAction,
  panelApprovalAction,
  removeMemberAction,
  replaceMemberAction,
  sendInvitesAction,
  setChairAction,
} from "@/actions/panels";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import type { Tone } from "@/lib/constants";

const INVITE: Record<string, { label: string; tone: Tone }> = {
  not_sent: { label: "Not invited", tone: "neutral" },
  pending: { label: "Invited", tone: "warning" },
  accepted: { label: "Accepted", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  replaced: { label: "Replaced", tone: "neutral" },
};

const PANEL_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "With the ED", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
};

/** One panel: members, invitations, replacements, ED approval and the availability poll. */
export function PanelCard({ panel, user }: { panel: typeof panels.$inferSelect; user: SessionUser }) {
  const members = db
    .select({ m: panelMembers, u: users })
    .from(panelMembers)
    .innerJoin(users, eq(users.id, panelMembers.userId))
    .where(eq(panelMembers.panelId, panel.id))
    .orderBy(asc(panelMembers.id))
    .all();
  const active = members.filter((r) => r.m.inviteStatus !== "replaced");
  const directory = db.select().from(users).where(and(eq(users.role, "panel"), eq(users.active, true))).orderBy(asc(users.name)).all();
  const available = directory.filter((d) => !members.some((r) => r.u.id === d.id));
  const slots = db.select().from(panelSlots).where(eq(panelSlots.panelId, panel.id)).orderBy(asc(panelSlots.startsAt)).all();
  const marks = slots.length
    ? db.select().from(panelAvailability).where(inArray(panelAvailability.slotId, slots.map((s) => s.id))).all()
    : [];
  const declared = db
    .select({ c: conflicts, panelist: users.name, appNo: applications.appNo, candidateId: applications.candidateId })
    .from(conflicts)
    .innerJoin(users, eq(users.id, conflicts.userId))
    .innerJoin(applications, eq(applications.id, conflicts.applicationId))
    .where(and(eq(conflicts.panelId, panel.id), eq(conflicts.hasConflict, true)))
    .all();
  const candidateNames = new Map(
    declared.length
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, declared.map((d) => d.candidateId))).all().map((u) => [u.id, u.name])
      : [],
  );
  const notInvited = active.filter((r) => r.m.inviteStatus === "not_sent").length;
  const isApprover = ["ed", "super_admin"].includes(user.role);
  const s = PANEL_STATUS[panel.status];
  const memberCols = active.filter((r) => r.m.inviteStatus === "accepted" || r.m.inviteStatus === "pending");

  return (
    <Card>
      <CardHeader
        title={panel.name || `${ROUND_LABELS[panel.round]} panel`}
        description={`${ROUND_LABELS[panel.round]} · ${active.length} member${active.length === 1 ? "" : "s"}`}
        actions={<Badge tone={s.tone}>{s.label}</Badge>}
      />
      <CardBody className="grid gap-6">
        {active.length === 0 ? (
          <p className="text-muted">No members yet. Add them from the directory below.</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Member</TH>
                <TH>Invitation</TH>
                <TH>Actions</TH>
              </tr>
            </THead>
            <tbody>
              {members.map(({ m, u }) => (
                <TR key={m.id} className={m.inviteStatus === "replaced" ? "opacity-70" : undefined}>
                  <TD className="min-w-48">
                    <p className="font-semibold">
                      {u.name} {m.isChair && <Badge tone="teal" className="ml-1">Chair</Badge>}
                    </p>
                    <p className="text-sm text-muted">
                      {[u.designation, u.organisation].filter(Boolean).join(", ")} · {u.external ? "External" : "Internal"}
                    </p>
                  </TD>
                  <TD className="min-w-40">
                    <Badge tone={INVITE[m.inviteStatus].tone}>{INVITE[m.inviteStatus].label}</Badge>
                    {m.respondedAt && <p className="mt-1 text-sm text-muted">{formatShortDate(m.respondedAt)}</p>}
                    {m.declineReason && <p className="mt-1 text-sm">Reason: {m.declineReason}</p>}
                    {m.inviteStatus === "replaced" && <p className="mt-1 text-sm">Replaced: {m.replaceReason}</p>}
                  </TD>
                  <TD className="min-w-56">
                    <div className="flex flex-wrap gap-2">
                      {!m.isChair && m.inviteStatus !== "replaced" && m.inviteStatus !== "declined" && (
                        <ActionForm action={setChairAction} showSuccess={false}>
                          <input type="hidden" name="memberId" value={m.id} />
                          <SubmitButton size="sm" variant="ghost">
                            Make chair
                          </SubmitButton>
                        </ActionForm>
                      )}
                      {m.inviteStatus === "not_sent" && (
                        <ActionForm action={removeMemberAction} showSuccess={false}>
                          <input type="hidden" name="memberId" value={m.id} />
                          <ConfirmButton question="Remove?" confirmText="Remove">
                            Remove
                          </ConfirmButton>
                        </ActionForm>
                      )}
                    </div>
                    {m.inviteStatus === "declined" && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[15px] font-semibold text-teal">Replace this member</summary>
                        <ActionForm action={replaceMemberAction} className="mt-3 grid gap-3">
                          <input type="hidden" name="memberId" value={m.id} />
                          <Field label="Replacement" htmlFor={`rep-${m.id}`}>
                            <Select id={`rep-${m.id}`} name="userId">
                              {available.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </Select>
                          </Field>
                          <Field label="Reason" htmlFor={`rep-reason-${m.id}`}>
                            <Input id={`rep-reason-${m.id}`} name="reason" defaultValue={m.declineReason ? `Declined: ${m.declineReason}` : ""} required />
                          </Field>
                          <div>
                            <SubmitButton size="sm">Replace and invite</SubmitButton>
                          </div>
                        </ActionForm>
                      </details>
                    )}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <ActionForm action={addMemberAction} className="grid content-start gap-3" resetOnSuccess>
            <input type="hidden" name="panelId" value={panel.id} />
            <Field label="Add from the directory" htmlFor={`add-${panel.id}`}>
              <Select id={`add-${panel.id}`} name="userId">
                {available.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.external ? "external" : "internal"}
                    {d.discipline ? `, ${d.discipline}` : ""})
                  </option>
                ))}
              </Select>
            </Field>
            <Checkbox name="isChair" label="Make this person the chair" />
            <div>
              <SubmitButton size="sm" variant="secondary">
                Add member
              </SubmitButton>
            </div>
          </ActionForm>

          <div className="grid content-start gap-3">
            <ActionForm action={sendInvitesAction}>
              <input type="hidden" name="panelId" value={panel.id} />
              <p className="mb-2 text-[15px] text-muted">The email links to the terms of reference, the rubric and the candidate files in the portal.</p>
              <SubmitButton size="sm" variant={notInvited ? "primary" : "secondary"} pendingText="Sending…">
                {notInvited ? `Send ${notInvited} invitation${notInvited === 1 ? "" : "s"}` : "Everyone has been invited"}
              </SubmitButton>
            </ActionForm>

            {panel.status === "pending_approval" && isApprover ? (
              <ActionForm action={panelApprovalAction} className="grid gap-3 border-t border-line pt-3">
                <input type="hidden" name="panelId" value={panel.id} />
                <Field label="Comment" htmlFor={`pa-comment-${panel.id}`} hint="Needed when you return it">
                  <Textarea id={`pa-comment-${panel.id}`} name="comment" rows={2} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <SubmitButton size="sm" name="intent" value="approve">
                    Approve panel
                  </SubmitButton>
                  <SubmitButton size="sm" name="intent" value="return" variant="secondary">
                    Return to HR
                  </SubmitButton>
                </div>
              </ActionForm>
            ) : panel.status === "pending_approval" ? (
              <Notice>Waiting for the Executive Director to approve this panel.</Notice>
            ) : panel.status === "draft" ? (
              <ActionForm action={panelApprovalAction} className="border-t border-line pt-3">
                <input type="hidden" name="panelId" value={panel.id} />
                <input type="hidden" name="intent" value="submit" />
                <SubmitButton size="sm" variant="secondary">
                  Send panel to ED for approval
                </SubmitButton>
              </ActionForm>
            ) : null}
          </div>
        </div>

        <section className="grid gap-4 border-t border-line pt-5">
          <div>
            <h3 className="text-base font-semibold">Availability poll</h3>
            <p className="text-[15px] text-muted">Offer slots; members tick the ones they can attend. Times are in PKT.</p>
          </div>
          {slots.length > 0 && (
            <Table>
              <THead>
                <tr>
                  <TH>Slot (PKT)</TH>
                  {memberCols.map(({ u }) => (
                    <TH key={u.id} className="text-center">
                      {u.name.split(" ").slice(-1)[0]}
                    </TH>
                  ))}
                  <TH className="text-right">Available</TH>
                  <TH>
                    <span className="sr-only">Remove</span>
                  </TH>
                </tr>
              </THead>
              <tbody>
                {slots.map((slot) => {
                  const yes = memberCols.filter(({ u }) => marks.some((x) => x.slotId === slot.id && x.userId === u.id && x.available)).length;
                  return (
                    <TR key={slot.id}>
                      <TD className="whitespace-nowrap">
                        {formatDateTime(slot.startsAt)}
                        <p className="text-sm text-muted">{slot.durationMin} minutes</p>
                      </TD>
                      {memberCols.map(({ u }) => {
                        const mark = marks.find((x) => x.slotId === slot.id && x.userId === u.id);
                        return (
                          <TD key={u.id} className="text-center">
                            {!mark ? (
                              <Minus className="mx-auto size-5 text-muted" aria-label="No answer" />
                            ) : mark.available ? (
                              <Check className="mx-auto size-5 text-success" aria-label="Available" />
                            ) : (
                              <X className="mx-auto size-5 text-danger" aria-label="Not available" />
                            )}
                          </TD>
                        );
                      })}
                      <TD className="text-right tabular-nums">
                        <Badge tone={yes === memberCols.length && yes > 0 ? "success" : yes ? "warning" : "neutral"}>
                          {yes} of {memberCols.length}
                        </Badge>
                      </TD>
                      <TD>
                        <ActionForm action={deleteSlotAction} showSuccess={false}>
                          <input type="hidden" name="slotId" value={slot.id} />
                          <ConfirmButton variant="ghost" question="Remove slot?" confirmText="Remove">
                            Remove
                          </ConfirmButton>
                        </ActionForm>
                      </TD>
                    </TR>
                  );
                })}
              </tbody>
            </Table>
          )}
          <ActionForm action={addSlotAction} className="flex flex-wrap items-end gap-3" resetOnSuccess>
            <input type="hidden" name="panelId" value={panel.id} />
            <Field label="Date and time (PKT)" htmlFor={`slot-${panel.id}`} className="min-w-56">
              <Input id={`slot-${panel.id}`} name="startsAt" type="datetime-local" required />
            </Field>
            <Field label="Minutes" htmlFor={`slot-dur-${panel.id}`} className="w-28">
              <Input id={`slot-dur-${panel.id}`} name="durationMin" type="number" min={15} max={240} step={5} defaultValue={45} />
            </Field>
            <SubmitButton size="md" variant="secondary">
              Add slot
            </SubmitButton>
          </ActionForm>
        </section>

        {declared.length > 0 && (
          <section className="border-t border-line pt-5">
            <h3 className="text-base font-semibold">Conflicts of interest</h3>
            <ul className="mt-2 grid gap-2">
              {declared.map((d) => (
                <li key={d.c.id} className="text-[15px]">
                  <span className="font-medium">{d.panelist}</span> with {candidateNames.get(d.candidateId)} ({d.appNo}): {d.c.note}
                  <span className="text-muted"> · excluded from this candidate</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </CardBody>
    </Card>
  );
}

