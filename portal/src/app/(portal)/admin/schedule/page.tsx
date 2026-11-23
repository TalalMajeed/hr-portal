import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gte, inArray, lt, notInArray } from "drizzle-orm";
import { ChevronLeft, ChevronRight, ExternalLink, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";
import { applications, candidateProfiles, events, positions, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { visiblePositionIds } from "@/lib/access";
import { runDueReminders } from "@/lib/reminders";
import { eventPanelists } from "@/lib/scheduling";
import { PKT, ROUND_LABELS, STAFF_ROLES } from "@/lib/constants";
import { formatDate, formatDual, formatTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";

export const metadata: Metadata = { title: "Schedule" };

function pktToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PKT, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function shift(day: string, n: number) {
  const d = new Date(`${day}T12:00:00+05:00`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: PKT, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export default async function DaySchedulePage({ searchParams }: PageProps<"/admin/schedule">) {
  const user = await requireUser(STAFF_ROLES);
  const sp = await searchParams;
  const day = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : pktToday();
  const sent = await runDueReminders();

  const start = new Date(`${day}T00:00:00+05:00`).toISOString();
  const end = new Date(`${shift(day, 1)}T00:00:00+05:00`).toISOString();
  const visible = await visiblePositionIds(user);
  const rows = (await db
    .select({ e: events, p: positions, a: applications, c: users, tz: candidateProfiles.timezone })
    .from(events)
    .innerJoin(positions, eq(positions.id, events.positionId))
    .innerJoin(applications, eq(applications.id, events.applicationId))
    .innerJoin(users, eq(users.id, applications.candidateId))
    .leftJoin(candidateProfiles, eq(candidateProfiles.userId, users.id))
    .where(
      and(
        gte(events.startsAt, start),
        lt(events.startsAt, end),
        notInArray(events.status, ["cancelled"]),
        visible === null ? undefined : inArray(events.positionId, visible.length ? visible : [-1]),
      ),
    )
    .orderBy(asc(events.startsAt))
    );

  const withPanel = await Promise.all(rows.map(async (r) => ({ ...r, panel: (await eventPanelists(r.e)).map((m) => m.user) })));
  const clashes = new Map<number, string[]>();
  for (let i = 0; i < withPanel.length; i++) {
    for (let j = i + 1; j < withPanel.length; j++) {
      const a = withPanel[i];
      const b = withPanel[j];
      const aEnd = new Date(a.e.startsAt).getTime() + a.e.durationMin * 60_000;
      const bStart = new Date(b.e.startsAt).getTime();
      const bEnd = bStart + b.e.durationMin * 60_000;
      const aStart = new Date(a.e.startsAt).getTime();
      if (!(aStart < bEnd && bStart < aEnd)) continue;
      const reasons: string[] = [];
      if (a.c.id === b.c.id) reasons.push(`${a.c.name} is booked twice`);
      for (const p of a.panel) if (b.panel.some((q) => q.id === p.id)) reasons.push(`${p.name} is on both panels`);
      if (!reasons.length) continue;
      clashes.set(a.e.id, [...(clashes.get(a.e.id) ?? []), ...reasons.map((r) => `${r} (with ${formatTime(b.e.startsAt)})`)]);
      clashes.set(b.e.id, [...(clashes.get(b.e.id) ?? []), ...reasons.map((r) => `${r} (with ${formatTime(a.e.startsAt)})`)]);
    }
  }

  return (
    <>
      <PageHeader title="Day schedule" description="Every interview, faculty talk and second round across positions. Times in PKT." />
      {sent > 0 && (
        <Notice tone="success" className="mb-4">
          {sent} reminder email{sent === 1 ? "" : "s"} sent for sessions in the next 24 hours.
        </Notice>
      )}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <ButtonLink href={`/admin/schedule?date=${shift(day, -1)}`} variant="secondary" size="sm" aria-label="Previous day">
            <ChevronLeft aria-hidden /> Previous
          </ButtonLink>
          <ButtonLink href={`/admin/schedule?date=${shift(day, 1)}`} variant="secondary" size="sm" aria-label="Next day">
            Next <ChevronRight aria-hidden />
          </ButtonLink>
          {day !== pktToday() && (
            <ButtonLink href="/admin/schedule" variant="ghost" size="sm">
              Today
            </ButtonLink>
          )}
        </div>
        <form method="get" className="flex items-end gap-2">
          <label className="grid gap-1.5">
            <span className="text-[15px] font-medium">Go to date</span>
            <input type="date" name="date" defaultValue={day} className="h-11 rounded-[4px] border border-line bg-white px-3 text-base focus:border-teal focus:outline-none" />
          </label>
          <button type="submit" className={buttonClass("primary", "md")}>
            Show
          </button>
        </form>
      </div>
      <h2 className="mb-3 text-xl font-semibold">{formatDate(`${day}T12:00:00+05:00`)}</h2>
      {clashes.size > 0 && (
        <Notice tone="error" title="Clashes on this day" className="mb-4">
          {clashes.size} sessions overlap with another session for the same candidate or panel member. They are marked below.
        </Notice>
      )}
      {withPanel.length === 0 ? (
        <EmptyState title="Nothing scheduled on this day" />
      ) : (
        <ol className="grid gap-3">
          {withPanel.map((r) => {
            const clash = clashes.get(r.e.id);
            return (
              <li key={r.e.id} className={`rounded-[10px] border bg-white px-5 py-4 ${clash ? "border-danger" : "border-line"}`}>
                <div className="flex flex-wrap items-start gap-4">
                  <div className="w-24 shrink-0">
                    <p className="font-serif text-2xl font-semibold tabular-nums">{formatTime(r.e.startsAt)}</p>
                    <p className="text-sm text-muted">{r.e.durationMin} min</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold">
                      <Link href={`/admin/applications/${r.a.id}`}>{r.c.name}</Link>
                    </p>
                    <p className="text-[15px]">
                      {ROUND_LABELS[r.e.round]} · <Link href={`/admin/positions/${r.p.id}/schedule`}>{r.p.title}</Link>
                    </p>
                    {r.tz && r.tz !== PKT && <p className="text-[15px] text-muted">{formatDual(r.e.startsAt, r.tz)}</p>}
                    <p className="text-[15px] text-muted">Panel: {r.panel.map((p) => p.name).join(", ") || "none assigned"}</p>
                    {r.e.mode === "online" && r.e.meetingUrl ? (
                      <a href={r.e.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[15px]">
                        Join link <ExternalLink className="size-4" aria-hidden />
                      </a>
                    ) : (
                      r.e.venue && <p className="text-[15px]">Venue: {r.e.venue}</p>
                    )}
                    {clash && (
                      <ul className="mt-2 grid gap-1">
                        {clash.map((c, i) => (
                          <li key={i} className="flex items-center gap-2 text-[15px] text-danger">
                            <TriangleAlert className="size-4 shrink-0" aria-hidden /> {c}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <EventStatusBadge status={r.e.status} />
                    {clash && <Badge tone="danger">Clash</Badge>}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
