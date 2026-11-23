import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { applications, events, evaluations, positions, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { panelsForUser, panelApplicationIds } from "@/lib/access";
import { ROUND_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { InviteResponse } from "@/components/panels/invite-response";

export const metadata: Metadata = { title: "My panels" };

export default async function PanelHome() {
  const user = await requireUser(["panel"]);
  const memberships = (await panelsForUser(user.id)).filter((m) => m.member.inviteStatus !== "replaced");
  const positionIds = [...new Set(memberships.map((m) => m.panel.positionId))];
  const posList = positionIds.length ? (await db.select().from(positions).where(inArray(positions.id, positionIds))) : [];
  const visibleApps = await panelApplicationIds(user.id);
  const acceptedPanels = memberships.filter((m) => m.member.inviteStatus === "accepted").map((m) => m.panel.id);
  const sessions = acceptedPanels.length
    ? (await db
        .select({ e: events, name: users.name, title: positions.title })
        .from(events)
        .innerJoin(applications, eq(applications.id, events.applicationId))
        .innerJoin(users, eq(users.id, applications.candidateId))
        .innerJoin(positions, eq(positions.id, events.positionId))
        .where(and(inArray(events.panelId, acceptedPanels), inArray(events.status, ["invited", "confirmed", "reschedule_requested", "completed"])))
        .orderBy(asc(events.startsAt))
        )
        .filter((s) => visibleApps.includes(s.e.applicationId))
    : [];
  const mine = sessions.length
    ? (await db.select().from(evaluations).where(and(eq(evaluations.panelistId, user.id), inArray(evaluations.eventId, sessions.map((s) => s.e.id)))))
    : [];
  const todo = sessions.filter((s) => mine.find((m) => m.eventId === s.e.id)?.status !== "submitted");

  return (
    <>
      <PageHeader title="My panels" description="Invitations, availability, candidate files and evaluation forms." />
      {memberships.length === 0 ? (
        <EmptyState title="No panel invitations yet">DU HR will email you when you are invited to a panel.</EmptyState>
      ) : (
        <div className="grid gap-6">
          {todo.length > 0 && (
            <Card>
              <CardHeader title="Evaluations to complete" description={`${todo.length} open`} />
              <CardBody className="p-0 sm:p-0">
                <ul className="divide-y divide-line">
                  {todo.map((s) => {
                    const ev = mine.find((m) => m.eventId === s.e.id);
                    return (
                      <li key={s.e.id}>
                        <Link href={`/panel/evaluate/${s.e.id}`} className="flex min-h-14 items-center justify-between gap-3 px-5 py-3 text-ink no-underline hover:bg-off sm:px-6">
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{s.name}</span>
                            <span className="block text-sm text-muted">
                              {ROUND_LABELS[s.e.round]} · {formatDateTime(s.e.startsAt)} PKT
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <Badge tone={ev?.status === "reopened" ? "danger" : ev ? "warning" : "neutral"}>{ev?.status === "reopened" ? "Reopened" : ev ? "Draft" : "Not started"}</Badge>
                            <ChevronRight className="size-5 text-muted" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </CardBody>
            </Card>
          )}

          {memberships.map(({ panel, member }) => {
            const pos = posList.find((p) => p.id === panel.positionId);
            const panelSessions = sessions.filter((s) => s.e.panelId === panel.id);
            return (
              <Card key={panel.id}>
                <CardHeader
                  title={pos?.title ?? "Position"}
                  description={`${ROUND_LABELS[panel.round]} panel${member.isChair ? " · You are the chair" : ""}`}
                  actions={
                    <Badge tone={member.inviteStatus === "accepted" ? "success" : member.inviteStatus === "declined" ? "danger" : "warning"}>
                      {member.inviteStatus === "accepted" ? "Accepted" : member.inviteStatus === "declined" ? "Declined" : "Invitation waiting"}
                    </Badge>
                  }
                />
                <CardBody className="grid gap-4">
                  {member.inviteStatus === "pending" && <InviteResponse panelId={panel.id} />}
                  {member.inviteStatus === "accepted" && (
                    <>
                      <Link href={`/panel/panels/${panel.id}`} className="inline-flex items-center gap-1 font-semibold">
                        Open panel: terms of reference, availability and candidates <ChevronRight className="size-4" aria-hidden />
                      </Link>
                      {panelSessions.length > 0 && (
                        <ul className="grid gap-2">
                          {panelSessions.map((s) => (
                            <li key={s.e.id} className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
                              <span>
                                {formatDateTime(s.e.startsAt)} PKT · {s.name}
                              </span>
                              <EventStatusBadge status={s.e.status} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  )}
                  {member.inviteStatus === "declined" && <p className="text-muted">You declined this invitation{member.declineReason ? `: ${member.declineReason}` : "."}</p>}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
