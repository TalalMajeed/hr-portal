import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { applications, boards, evaluations, events, panelMembers, positions, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { visiblePositionIds } from "@/lib/access";
import { closeExpiredAdverts } from "@/lib/adverts";
import { pendingApprovals } from "@/lib/approvals";
import { ROLE_LABELS, ROUND_LABELS, STAFF_ROLES, STAGES } from "@/lib/constants";
import { formatDateTime, relativeDays } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Dashboard" };

function MiniStages({ stage }: { stage: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`Stage ${stage} of 10`}>
      {STAGES.map((s) => (
        <span key={s.n} className={cn("h-1.5 w-3 rounded-full sm:w-4", s.n < stage ? "bg-teal" : s.n === stage ? "bg-teal-dark" : "bg-line")} />
      ))}
    </span>
  );
}

/** I1: open positions, applications, stage of each position, this week's interviews, pending evaluations and decisions. */
export default async function Dashboard() {
  const user = await requireUser(STAFF_ROLES);
  await closeExpiredAdverts();
  const scope = await visiblePositionIds(user);
  const inScope = (id: number) => !scope || scope.includes(id);

  const ps = (await db.select().from(positions).orderBy(asc(positions.stage))).filter((p) => inScope(p.id));
  const active = ps.filter((p) => p.status === "active");
  const apps = (await db.select().from(applications)).filter((a) => inScope(a.positionId) && a.status !== "draft");
  const appsByPos = new Map<number, number>();
  for (const a of apps) appsByPos.set(a.positionId, (appsByPos.get(a.positionId) ?? 0) + 1);
  const now = new Date();
  const recent = apps.filter((a) => a.submittedAt && now.getTime() - new Date(a.submittedAt).getTime() < 7 * 86_400_000).length;

  const weekEnd = new Date(now.getTime() + 7 * 86_400_000);
  const upcoming = (await db
    .select({ e: events, name: users.name, title: positions.title, code: positions.code })
    .from(events)
    .innerJoin(applications, eq(applications.id, events.applicationId))
    .innerJoin(users, eq(users.id, applications.candidateId))
    .innerJoin(positions, eq(positions.id, events.positionId))
    .where(and(gte(events.startsAt, now.toISOString()), lte(events.startsAt, weekEnd.toISOString())))
    .orderBy(asc(events.startsAt))
    )
    .filter((r) => inScope(r.e.positionId) && !["cancelled", "declined"].includes(r.e.status));

  // Evaluations owed: accepted panel members of past sessions without a submitted form.
  const pastEvents = (await db.select().from(events).where(lte(events.startsAt, now.toISOString()))).filter((e) => inScope(e.positionId) && e.panelId && !["cancelled", "declined"].includes(e.status));
  const evals = (await db.select().from(evaluations));
  const members = (await db.select().from(panelMembers).where(eq(panelMembers.inviteStatus, "accepted")));
  let pendingEvals = 0;
  const pendingByPos = new Map<number, number>();
  for (const e of pastEvents) {
    for (const m of members.filter((x) => x.panelId === e.panelId)) {
      const done = evals.some((v) => v.eventId === e.id && v.panelistId === m.userId && v.status === "submitted");
      if (!done) {
        pendingEvals++;
        pendingByPos.set(e.positionId, (pendingByPos.get(e.positionId) ?? 0) + 1);
      }
    }
  }

  const approvals = (await pendingApprovals()).filter((a) => inScope(a.positionId));
  const boardRows = (await db.select().from(boards));
  const awaitingDecision = ps.filter((p) => p.stage === 10 && p.status === "active" && !boardRows.find((b) => b.positionId === p.id)?.edSignedOffAt);
  const decisionCount = approvals.length + awaitingDecision.length;
  const pktHour = (now.getUTCHours() + 5) % 24;
  const firstName = user.name.split(" ").find((w) => !/^(Dr|Prof|Mr|Ms|Mrs|Justice|\(R\))\.?$/.test(w)) ?? user.name;

  return (
    <>
      <PageHeader
        title={`Good ${pktHour < 12 ? "morning" : pktHour < 17 ? "afternoon" : "evening"}, ${firstName}`}
        description={`${ROLE_LABELS[user.role]} dashboard`}
        actions={
          ["super_admin", "hr", "hiring_lead"].includes(user.role) && (
            <ButtonLink href="/admin/positions/new" variant="secondary">
              New position
            </ButtonLink>
          )
        }
      />
      <StatGrid>
        <Stat label="Open positions" value={active.length} hint={`${active.reduce((s, p) => s + p.posts, 0)} posts`} href="/admin/positions" />
        <Stat label="Applications" value={apps.length} hint={`${recent} in the last 7 days`} href="/admin/reports?r=summary" />
        <Stat label="Sessions this week" value={upcoming.length} hint="Interviews, talks and second rounds" href="/admin/schedule" />
        <Stat label="Waiting for a decision" value={decisionCount} hint={`${pendingEvals} evaluations outstanding`} href="/admin/approvals" />
      </StatGrid>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader title="Where each position is" description="Stage of every active position and its applications." />
          <CardBody className="p-0 sm:p-0">
            {active.length === 0 ? (
              <p className="px-5 py-5 text-muted sm:px-6">No active positions.</p>
            ) : (
              <ul className="divide-y divide-line">
                {active.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/positions/${p.id}`} className="flex items-center gap-4 px-5 py-3.5 no-underline transition-colors duration-150 hover:bg-off sm:px-6">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{p.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <MiniStages stage={p.stage} />
                          <span className="text-sm text-muted">
                            {p.stage}. {STAGES[p.stage - 1].name}
                          </span>
                          {pendingByPos.get(p.id) ? <Badge tone="warning">{pendingByPos.get(p.id)} evaluations due</Badge> : null}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums text-ink">{appsByPos.get(p.id) ?? 0}</p>
                        <p className="text-sm text-muted">applied</p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="Waiting for a decision" actions={<Link href="/admin/approvals" className="text-[15px] font-semibold">All approvals</Link>} />
            <CardBody className="p-0 sm:p-0">
              {decisionCount === 0 ? (
                <p className="px-5 py-5 text-muted sm:px-6">Nothing is waiting.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {awaitingDecision.map((p) => (
                    <li key={`b${p.id}`}>
                      <Link href={`/admin/positions/${p.id}/board`} className="block px-5 py-3 no-underline hover:bg-off sm:px-6">
                        <Badge tone="sand">Selection Board</Badge>
                        <p className="mt-1 truncate font-semibold text-ink">{p.title}</p>
                      </Link>
                    </li>
                  ))}
                  {approvals.slice(0, 6).map((a) => (
                    <li key={`${a.kind}${a.positionId}${a.detail}`}>
                      <Link href={a.href} className="block px-5 py-3 no-underline hover:bg-off sm:px-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone="teal">{a.detail}</Badge>
                          <span className="text-sm text-muted">with {a.waitingOn}, {relativeDays(a.since)}</span>
                        </div>
                        <p className="mt-1 truncate font-semibold text-ink">{a.title}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="This week" actions={<Link href="/admin/schedule" className="text-[15px] font-semibold">Day view</Link>} />
            <CardBody className="p-0 sm:p-0">
              {upcoming.length === 0 ? (
                <p className="px-5 py-5 text-muted sm:px-6">No sessions in the next 7 days.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {upcoming.slice(0, 8).map(({ e, name, title }) => (
                    <li key={e.id} className="px-5 py-3 sm:px-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold">{name}</p>
                        <EventStatusBadge status={e.status} />
                      </div>
                      <p className="text-[15px] text-muted">
                        {ROUND_LABELS[e.round]} · {title}
                      </p>
                      <p className="text-[15px]">{formatDateTime(e.startsAt)} PKT</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
