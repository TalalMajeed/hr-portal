import type { Metadata } from "next";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, candidateProfiles, events, panelAvailability, panelMembers, panels, panelSlots, users, type PanelRound } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { PKT, ROUND_LABELS, STAFF_ROLES } from "@/lib/constants";
import { zoomConfigured } from "@/lib/meetings";
import { isPast } from "@/lib/scheduling";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { ScheduleForm, type ScheduleCandidate, type SchedulePanel } from "@/components/scheduling/schedule-form";
import { EventList, type EventItem } from "@/components/scheduling/event-list";

export const metadata: Metadata = { title: "Schedule" };

const ACTIVE = ["invited", "confirmed", "reschedule_requested", "completed"] as const;

export default async function SchedulePage({ params }: PageProps<"/admin/positions/[id]/schedule">) {
  const user = await requireUser(STAFF_ROLES);
  const { id } = await params;
  const position = await positionForPage(user, id);

  const apps = (await db
    .select({ app: applications, candidate: users, tz: candidateProfiles.timezone })
    .from(applications)
    .innerJoin(users, eq(users.id, applications.candidateId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.userId, users.id))
    .where(eq(applications.positionId, position.id))
    );
  const evs = (await db.select().from(events).where(eq(events.positionId, position.id)).orderBy(asc(events.startsAt)));
  const panelRows = (await db.select().from(panels).where(eq(panels.positionId, position.id)).orderBy(asc(panels.id)));

  const rounds: PanelRound[] = position.type === "faculty" ? ["interview", "talk", "second_round"] : ["interview", "second_round"];
  const candidates: ScheduleCandidate[] = apps
    .filter((a) => !["withdrawn", "not_selected", "draft"].includes(a.app.status))
    .map((a) => {
      const hadInterview = evs.some((e) => e.applicationId === a.app.id && e.round === "interview" && (ACTIVE as readonly string[]).includes(e.status));
      const r: PanelRound[] = [];
      if (["short", "reserve"].includes(a.app.listStatus)) r.push("interview");
      if (hadInterview) r.push("talk", "second_round");
      return { id: a.app.id, name: a.candidate.name, appNo: a.app.appNo ?? "", tz: a.tz ?? PKT, rounds: r };
    })
    .filter((c) => c.rounds.length);

  const schedPanels: SchedulePanel[] = await Promise.all(panelRows.map(async (p) => {
    const accepted = (await db
      .select({ userId: panelMembers.userId })
      .from(panelMembers)
      .where(and(eq(panelMembers.panelId, p.id), eq(panelMembers.inviteStatus, "accepted")))
      )
      .map((m) => m.userId);
    const slots = (await db.select().from(panelSlots).where(eq(panelSlots.panelId, p.id)).orderBy(asc(panelSlots.startsAt))).filter((s) => !isPast(s.startsAt));
    const marks = slots.length ? (await db.select().from(panelAvailability).where(inArray(panelAvailability.slotId, slots.map((s) => s.id)))) : [];
    return {
      id: p.id,
      round: p.round,
      name: p.name || `${ROUND_LABELS[p.round]} panel`,
      approved: p.status === "approved",
      slots: slots.map((s) => ({
        id: s.id,
        startsAt: s.startsAt,
        durationMin: s.durationMin,
        total: accepted.length,
        available: marks.filter((m) => m.slotId === s.id && m.available && accepted.includes(m.userId)).length,
        taken: evs.some((e) => e.panelId === p.id && e.startsAt === s.startsAt && !["cancelled", "declined"].includes(e.status)),
      })),
    };
  }));

  const items: (EventItem & { round: PanelRound })[] = evs.map((e) => {
    const a = apps.find((x) => x.app.id === e.applicationId)!;
    const panel = panelRows.find((p) => p.id === e.panelId);
    return { event: e, candidate: a.candidate, tz: a.tz ?? PKT, appNo: a.app.appNo, panelName: panel ? panel.name || `${ROUND_LABELS[panel.round]} panel` : "", round: e.round };
  });
  const counts = {
    confirmed: evs.filter((e) => e.status === "confirmed").length,
    pending: evs.filter((e) => e.status === "invited").length,
    reschedule: evs.filter((e) => e.status === "reschedule_requested").length,
  };

  return (
    <div className="grid gap-6">
      {!zoomConfigured() && (
        <Notice tone="info" title="Video calls are simulated">
          No Zoom account is connected, so meeting links are placeholders. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET on the server to create real Zoom
          meetings with the waiting room on.
        </Notice>
      )}
      <Card>
        <CardHeader title="Schedule a session" description="Interviews, faculty talks and second-round presentations. Candidates confirm, decline or ask for another time from their dashboard." />
        <CardBody>
          {candidates.length === 0 ? (
            <EmptyState title="Nobody to schedule yet">Move candidates to the shortlist or reserve list on the Applications tab first.</EmptyState>
          ) : (
            <ScheduleForm positionId={position.id} candidates={candidates} panels={schedPanels} rounds={rounds} />
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Badge tone="success">{counts.confirmed} confirmed</Badge>
        <Badge tone="warning">{counts.pending} pending</Badge>
        <Badge tone={counts.reschedule ? "danger" : "neutral"}>{counts.reschedule} reschedule requested</Badge>
      </div>

      {rounds.map((r) => {
        const list = items.filter((i) => i.round === r);
        if (!list.length) return null;
        return (
          <section key={r}>
            <h2 className="mb-3 text-lg font-semibold">{ROUND_LABELS[r]}</h2>
            <EventList items={list} />
          </section>
        );
      })}
      {items.length === 0 && <EmptyState title="No sessions scheduled yet" />}
    </div>
  );
}
