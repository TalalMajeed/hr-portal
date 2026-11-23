import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, conflicts, consensus, events, panelAvailability, panelMembers, panels, panelSlots, positions, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { panelApplicationIds } from "@/lib/access";
import { getDoc } from "@/lib/positions";
import { scoreSheet } from "@/lib/evaluations";
import { ROUND_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { declareConflictAction, saveAvailabilityAction } from "@/actions/panels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { InviteResponse } from "@/components/panels/invite-response";
import { ConsensusForm } from "@/components/evaluations/consensus-form";

export const metadata: Metadata = { title: "Panel" };

export default async function PanelPage({ params }: PageProps<"/panel/panels/[panelId]">) {
  const user = await requireUser(["panel"]);
  const { panelId } = await params;
  const panel = db.select().from(panels).where(eq(panels.id, Number(panelId))).get();
  if (!panel) notFound();
  const member = db
    .select()
    .from(panelMembers)
    .where(and(eq(panelMembers.panelId, panel.id), eq(panelMembers.userId, user.id), ne(panelMembers.inviteStatus, "replaced")))
    .orderBy(desc(panelMembers.id))
    .get();
  if (!member) notFound();
  const position = db.select().from(positions).where(eq(positions.id, panel.positionId)).get()!;
  audit(user.id, "viewed", "panel", panel.id);

  const header = (
    <PageHeader
      crumbs={[{ label: "My panels", href: "/panel" }, { label: ROUND_LABELS[panel.round] }]}
      title={position.title}
      description={`${ROUND_LABELS[panel.round]} panel · ${position.department}${member.isChair ? " · You are the chair" : ""}`}
    />
  );
  if (member.inviteStatus !== "accepted") {
    return (
      <>
        {header}
        <Card>
          <CardHeader title={member.inviteStatus === "declined" ? "You declined this invitation" : "Please respond to the invitation"} />
          <CardBody>{member.inviteStatus === "pending" || member.inviteStatus === "not_sent" ? <InviteResponse panelId={panel.id} /> : <p className="text-muted">Thank you for letting us know.</p>}</CardBody>
        </Card>
      </>
    );
  }

  const tor = getDoc(position.id, "tor_committee");
  const items = getDoc(position.id, "rubric")?.[panel.round] ?? [];
  const slots = db.select().from(panelSlots).where(eq(panelSlots.panelId, panel.id)).orderBy(asc(panelSlots.startsAt)).all();
  const myMarks = slots.length
    ? db.select().from(panelAvailability).where(and(eq(panelAvailability.userId, user.id), inArray(panelAvailability.slotId, slots.map((s) => s.id)))).all()
    : [];
  const panelEvents = db.select().from(events).where(and(eq(events.panelId, panel.id), ne(events.status, "cancelled"))).orderBy(asc(events.startsAt)).all();
  const candidateRows = db
    .select({ app: applications, candidate: users })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(
      and(
        eq(applications.positionId, position.id),
        panel.round === "interview"
          ? or(eq(applications.listStatus, "short"), inArray(applications.id, panelEvents.length ? panelEvents.map((e) => e.applicationId) : [-1]))
          : inArray(applications.id, panelEvents.length ? panelEvents.map((e) => e.applicationId) : [-1]),
      ),
    )
    .orderBy(asc(users.name))
    .all();
  const declarations = db.select().from(conflicts).where(and(eq(conflicts.panelId, panel.id), eq(conflicts.userId, user.id))).all();
  const visible = new Set(panelApplicationIds(user.id));
  const sheet = member.isChair ? scoreSheet(position.id, panel.round) : null;
  const cons = member.isChair ? db.select().from(consensus).where(and(eq(consensus.positionId, position.id), eq(consensus.round, panel.round))).get() ?? null : null;

  return (
    <>
      {header}
      <div className="grid gap-6">
        <Card>
          <CardHeader title="Candidates" description="Declare any conflict of interest before you open a candidate's file." />
          <CardBody className="p-0 sm:p-0">
            <span id="candidates" />
            {candidateRows.length === 0 ? (
              <p className="px-5 py-5 text-muted sm:px-6">Candidates appear here once the shortlist is approved.</p>
            ) : (
              <ul className="divide-y divide-line">
                {candidateRows.map(({ app, candidate }) => {
                  const d = declarations.find((x) => x.applicationId === app.id);
                  const ev = panelEvents.filter((e) => e.applicationId === app.id);
                  return (
                    <li key={app.id} className="grid gap-3 px-5 py-4 sm:px-6">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold">{candidate.name}</p>
                          <p className="text-sm text-muted">{app.appNo}</p>
                          {ev.map((e) => (
                            <p key={e.id} className="mt-1 flex flex-wrap items-center gap-2 text-[15px]">
                              {formatDateTime(e.startsAt)} PKT <EventStatusBadge status={e.status} />
                            </p>
                          ))}
                        </div>
                        {d ? <Badge tone={d.hasConflict ? "danger" : "success"}>{d.hasConflict ? "Conflict declared" : "No conflict"}</Badge> : <Badge tone="warning">Declaration needed</Badge>}
                      </div>
                      {d?.hasConflict ? (
                        <p className="text-[15px] text-muted">You won&apos;t see or score this candidate. {d.note}</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {d && visible.has(app.id) && (
                            <ButtonLink href={`/panel/candidates/${app.id}`} variant="secondary" size="sm">
                              Open file
                            </ButtonLink>
                          )}
                          {d &&
                            ev
                              .filter((e) => e.status !== "declined")
                              .map((e) => (
                                <ButtonLink key={e.id} href={`/panel/evaluate/${e.id}`} size="sm">
                                  Evaluate
                                </ButtonLink>
                              ))}
                        </div>
                      )}
                      {!d?.hasConflict && (
                        <details open={!d}>
                          <summary className="cursor-pointer text-[15px] font-semibold text-teal">{d ? "Change declaration" : "Declare conflict of interest"}</summary>
                          <ActionForm action={declareConflictAction} className="mt-3 grid gap-3">
                            <input type="hidden" name="panelId" value={panel.id} />
                            <input type="hidden" name="applicationId" value={app.id} />
                            <fieldset className="grid gap-2 sm:grid-cols-2">
                              <legend className="mb-1 text-[15px] font-medium">Do you have a conflict of interest with {candidate.name}?</legend>
                              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[4px] border border-line px-3 has-[:checked]:border-teal has-[:checked]:bg-tint">
                                <input type="radio" name="conflict" value="no" defaultChecked={d ? !d.hasConflict : false} required className="size-[18px] accent-teal" />
                                No conflict
                              </label>
                              <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[4px] border border-line px-3 has-[:checked]:border-teal has-[:checked]:bg-tint">
                                <input type="radio" name="conflict" value="yes" className="size-[18px] accent-teal" />
                                Yes, I have a conflict
                              </label>
                            </fieldset>
                            <Field label="Details (needed for a conflict)" htmlFor={`coi-${app.id}`} hint="For example: former PhD student, co-author, relative">
                              <Input id={`coi-${app.id}`} name="note" />
                            </Field>
                            <div>
                              <SubmitButton size="sm">Save declaration</SubmitButton>
                            </div>
                          </ActionForm>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Your availability" description="Tick every slot you can attend. Times are Pakistan time (PKT)." />
          <CardBody>
            {slots.length === 0 ? (
              <p className="text-muted">HR hasn&apos;t offered any slots yet.</p>
            ) : (
              <ActionForm action={saveAvailabilityAction} className="grid gap-3">
                <input type="hidden" name="panelId" value={panel.id} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {slots.map((s) => {
                    const mark = myMarks.find((m) => m.slotId === s.id);
                    return (
                      <label key={s.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-[4px] border border-line bg-white px-3 has-[:checked]:border-teal has-[:checked]:bg-tint">
                        <input type="checkbox" name="slotIds" value={s.id} defaultChecked={mark?.available ?? false} className="size-5 accent-teal" />
                        <span>
                          <span className="block text-[15px] font-medium">{formatDateTime(s.startsAt)}</span>
                          <span className="block text-sm text-muted">{s.durationMin} minutes</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div>
                  <SubmitButton>Save availability</SubmitButton>
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Terms of reference" />
          <CardBody>
            <span id="tors" />
            <p className="whitespace-pre-line">{tor?.body || "Not added yet."}</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Evaluation rubric" description={`Used for the ${ROUND_LABELS[panel.round].toLowerCase()} form`} />
          <CardBody>
            <span id="rubric" />
            {items.length === 0 ? (
              <p className="text-muted">Not set yet.</p>
            ) : (
              <ul className="grid gap-2">
                {items.map((i) => (
                  <li key={i.key} className="flex flex-wrap justify-between gap-2 rounded-[4px] bg-off px-3 py-2">
                    <span className="font-medium">{i.label}</span>
                    <span className="text-[15px] text-muted">
                      weight {i.weight}% · out of {i.maxScore} · minimum {i.minScore}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {sheet && (
          <Card>
            <CardHeader title="Panel consensus" description="As chair, record the agreed ranking and sign it off for the Selection Board." />
            <CardBody>
              <ConsensusForm
                positionId={position.id}
                round={panel.round}
                rows={sheet.rows.map((r) => ({ appId: r.app.id, name: r.candidate.name, total: r.total, rank: r.rank }))}
                existing={cons}
                canEdit
                isChair
                chairName={user.name}
              />
              <p className="mt-3 text-[15px]">
                <Link href="/panel">Back to my panels</Link>
              </p>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
