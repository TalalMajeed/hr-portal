import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, candidateProfiles, conflicts, events, panelMembers, positions, users } from "@/lib/db/schema";
import { formatDual, formatDateTime } from "@/lib/format";
import { PKT, ROUND_LABELS } from "@/lib/constants";
import { appUrl, sendTemplate } from "@/lib/email";

type EventRow = typeof events.$inferSelect;

export function sessionLabel(round: EventRow["round"]) {
  return round === "interview" ? "interview" : round === "talk" ? "faculty talk" : "second-round presentation";
}

export function roundTitle(round: EventRow["round"]) {
  return ROUND_LABELS[round];
}

export const PROVIDER_LABELS: Record<string, string> = { zoom: "Zoom", meet: "Google Meet", teams: "Microsoft Teams" };

/** "Join: <link> (passcode 123456). The waiting room is on." or "Venue: Room 2". */
export function eventLocationText(e: Pick<EventRow, "mode" | "venue" | "meetingUrl" | "passcode" | "waitingRoom" | "meetingProvider">) {
  if (e.mode === "in_person") return `Venue: ${e.venue || "to be confirmed"}`;
  if (!e.meetingUrl) return "Online. The joining link will follow.";
  const provider = PROVIDER_LABELS[e.meetingProvider] ?? "Online";
  return `${provider} link: ${e.meetingUrl}${e.passcode ? ` (passcode ${e.passcode})` : ""}${e.waitingRoom ? ". The waiting room is on; the panel will admit you." : ""}`;
}

/** The event with its position, application, candidate and candidate time zone. */
export function loadEvent(eventId: number) {
  const row = db
    .select({ event: events, position: positions, app: applications, candidate: users })
    .from(events)
    .innerJoin(positions, eq(positions.id, events.positionId))
    .innerJoin(applications, eq(applications.id, events.applicationId))
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(eq(events.id, eventId))
    .get();
  if (!row) return null;
  const tz = db.select({ tz: candidateProfiles.timezone }).from(candidateProfiles).where(eq(candidateProfiles.userId, row.candidate.id)).get()?.tz ?? PKT;
  return { ...row, tz };
}

/** Accepted panel members of the event's panel who have not declared a conflict with this candidate. */
export function eventPanelists(e: Pick<EventRow, "panelId" | "applicationId">) {
  if (!e.panelId) return [];
  const members = db
    .select({ user: users, member: panelMembers })
    .from(panelMembers)
    .innerJoin(users, eq(users.id, panelMembers.userId))
    .where(and(eq(panelMembers.panelId, e.panelId), eq(panelMembers.inviteStatus, "accepted")))
    .all();
  const conflicted = new Set(
    db
      .select({ userId: conflicts.userId })
      .from(conflicts)
      .where(and(eq(conflicts.panelId, e.panelId), eq(conflicts.applicationId, e.applicationId), eq(conflicts.hasConflict, true)))
      .all()
      .map((c) => c.userId),
  );
  return members.filter((m) => !conflicted.has(m.user.id));
}

export function panelLink(user: { external: boolean; accessToken: string | null }, path = "/panel") {
  return user.external && user.accessToken ? appUrl(`/x/${user.accessToken}`) : appUrl(path);
}

export function isPlaceholder(email: string) {
  return email.endsWith("@placeholder.local");
}

/** F2: emails the candidate their invitation for the event's round. */
export function sendEventInvite(eventId: number) {
  const r = loadEvent(eventId);
  if (!r || isPlaceholder(r.candidate.email)) return;
  const e = r.event;
  const key = e.round === "interview" ? "interview_invite" : e.round === "talk" ? "talk_invite" : "second_round_invite";
  sendTemplate(
    key,
    { email: r.candidate.email, userId: r.candidate.id },
    {
      name: r.candidate.name,
      position: r.position.title,
      when: formatDual(e.startsAt, r.tz),
      mode: e.mode === "online" ? "Online" : "In person",
      venue_or_link: eventLocationText(e),
      prep: e.prepNote || "Nothing extra.",
      topic: e.topic,
      audience: e.audience,
      duration: e.durationMin,
      brief: e.brief,
    },
    { applicationId: r.app.id, positionId: r.position.id },
  );
}

/** F4: tells the candidate and the panel about a new time. */
export function sendRescheduleNotices(eventId: number) {
  const r = loadEvent(eventId);
  if (!r) return;
  const e = r.event;
  const vars = {
    position: r.position.title,
    session: sessionLabel(e.round),
    mode: e.mode === "online" ? "Online" : "In person",
    venue_or_link: eventLocationText(e),
  };
  if (!isPlaceholder(r.candidate.email)) {
    sendTemplate("event_rescheduled", { email: r.candidate.email, userId: r.candidate.id }, { ...vars, name: r.candidate.name, when: formatDual(e.startsAt, r.tz) }, { applicationId: r.app.id, positionId: r.position.id });
  }
  for (const m of eventPanelists(e)) {
    sendTemplate(
      "event_rescheduled",
      { email: m.user.email, userId: m.user.id },
      { ...vars, name: m.user.name, session: `${sessionLabel(e.round)} with ${r.candidate.name}`, when: `${formatDateTime(e.startsAt)} PKT` },
      { applicationId: r.app.id, positionId: r.position.id },
    );
  }
}

/** True when the time has passed. Kept out of render bodies so components stay pure. */
export function isPast(iso: string) {
  return new Date(iso).getTime() <= Date.now();
}
