import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { panelMembers } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { buildIcs, sequenceFor } from "@/lib/ics";
import { FROM_ADDRESS } from "@/lib/email";
import { eventLocationText, eventPanelists, loadEvent, roundTitle } from "@/lib/scheduling";
import { STAFF_ROLES } from "@/lib/constants";

/** F6: calendar invitation for a confirmed session. */
export async function GET(request: Request, ctx: RouteContext<"/api/events/[id]/ics">) {
  const user = await getUser();
  if (!user) return new Response("Sign in to download this invitation.", { status: 401 });
  const { id } = await ctx.params;
  const r = loadEvent(Number(id));
  if (!r) return new Response("Session not found.", { status: 404 });
  const e = r.event;

  let allowed = r.candidate.id === user.id;
  if (!allowed && STAFF_ROLES.includes(user.role)) allowed = canManagePosition(user, r.position);
  if (!allowed && user.role === "panel" && e.panelId) {
    allowed = !!db
      .select()
      .from(panelMembers)
      .where(and(eq(panelMembers.panelId, e.panelId), eq(panelMembers.userId, user.id), eq(panelMembers.inviteStatus, "accepted")))
      .get();
  }
  if (!allowed) return new Response("You don't have access to this session.", { status: 403 });
  if (e.status !== "confirmed") return new Response("Only confirmed sessions go on calendars.", { status: 409 });

  const host = new URL(request.url).host;
  const ics = buildIcs({
    uid: `du-event-${e.id}@${host}`,
    sequence: sequenceFor(e.createdAt, e.updatedAt),
    startsAt: e.startsAt,
    durationMin: e.durationMin,
    summary: `${roundTitle(e.round)}: ${r.position.title} (${r.candidate.name})`,
    description: [eventLocationText(e), e.topic && `Topic: ${e.topic}`, e.brief && `Brief: ${e.brief}`, e.prepNote && `Prepare: ${e.prepNote}`].filter(Boolean).join("\n"),
    location: e.mode === "online" ? e.meetingUrl : e.venue,
    url: e.mode === "online" ? e.meetingUrl : undefined,
    organizer: { name: "DU Human Resources", email: FROM_ADDRESS },
    attendees: [
      ...(r.candidate.email.endsWith("@placeholder.local") ? [] : [{ name: r.candidate.name, email: r.candidate.email }]),
      ...eventPanelists(e).map((m) => ({ name: m.user.name, email: m.user.email })),
    ],
  });
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8; method=REQUEST",
      "Content-Disposition": `attachment; filename="du-${e.round}-${e.id}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
