"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, events, panels, panelSlots, positions, users, type PanelRound } from "@/lib/db/schema";
import { assertUser, type SessionUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { setApplicationStatus } from "@/lib/applications";
import { setStage } from "@/lib/positions";
import { createMeeting, type MeetingProvider } from "@/lib/meetings";
import { eventPanelists, isPlaceholder, loadEvent, sendEventInvite, sendRescheduleNotices, sessionLabel } from "@/lib/scheduling";
import { PANEL_ROUNDS, ROUND_LABELS, STAFF_ROLES } from "@/lib/constants";
import { formatDateTime, pktInputToIso } from "@/lib/format";
import { done, fail, num, safe, str, type ActionState } from "@/lib/action-state";

const MANAGERS = STAFF_ROLES;
const PROVIDERS: MeetingProvider[] = ["zoom", "meet", "teams"];
const ACTIVE = ["invited", "confirmed", "reschedule_requested", "completed"] as const;

function positionFor(user: SessionUser, positionId: number) {
  const p = db.select().from(positions).where(eq(positions.id, positionId)).get();
  if (!p || !canManagePosition(user, p)) throw new Error("You can't manage this position.");
  return p;
}

function eventFor(user: SessionUser, eventId: number) {
  const e = db.select().from(events).where(eq(events.id, eventId)).get();
  if (!e) throw new Error("That session no longer exists.");
  const position = positionFor(user, e.positionId);
  return { e, position };
}

function refresh(positionId: number, applicationId?: number) {
  revalidatePath(`/admin/positions/${positionId}/schedule`);
  revalidatePath("/admin/schedule");
  revalidatePath("/panel");
  revalidatePath("/me");
  if (applicationId) revalidatePath(`/admin/applications/${applicationId}`);
}

/** F2, F5, F7, F8: schedules one session for one candidate and emails the invitation. */
export async function createEventAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const position = positionFor(user, num(fd, "positionId"));
    const round = str(fd, "round") as PanelRound;
    if (!PANEL_ROUNDS.includes(round)) return fail("Choose the type of session.");
    const app = db.select().from(applications).where(and(eq(applications.id, num(fd, "applicationId")), eq(applications.positionId, position.id))).get();
    if (!app) return fail("Choose a candidate.", { applicationId: "Required" });
    if (["withdrawn", "not_selected", "draft"].includes(app.status)) return fail("This candidate is no longer in the process.");

    if (round === "interview" && !["short", "reserve"].includes(app.listStatus)) {
      return fail("Only shortlisted or reserve candidates can be invited to interview.");
    }
    if (round !== "interview") {
      const hadInterview = db
        .select()
        .from(events)
        .where(and(eq(events.applicationId, app.id), eq(events.round, "interview"), inArray(events.status, [...ACTIVE])))
        .get();
      if (!hadInterview) return fail(`${ROUND_LABELS[round]} is for candidates from round one. Schedule an interview first.`);
    }
    const clash = db
      .select()
      .from(events)
      .where(and(eq(events.applicationId, app.id), eq(events.round, round), inArray(events.status, ["invited", "confirmed", "reschedule_requested"])))
      .get();
    if (clash) return fail(`This candidate already has an open ${sessionLabel(round)}. Reschedule that one instead.`);

    let panelId: number | null = num(fd, "panelId") || null;
    if (panelId) {
      const panel = db.select().from(panels).where(and(eq(panels.id, panelId), eq(panels.positionId, position.id))).get();
      if (!panel) panelId = null;
    }

    let startsAt = "";
    let durationMin = Math.min(240, Math.max(10, num(fd, "durationMin", round === "talk" ? 30 : 45)));
    const slotId = num(fd, "slotId");
    if (slotId) {
      const slot = db.select().from(panelSlots).where(eq(panelSlots.id, slotId)).get();
      if (!slot) return fail("That slot is no longer available.");
      startsAt = slot.startsAt;
      if (!str(fd, "durationMin")) durationMin = slot.durationMin;
    } else {
      startsAt = pktInputToIso(str(fd, "startsAt"));
    }
    if (!startsAt) return fail("Pick a suggested slot or enter a date and time.", { startsAt: "Required" });
    if (new Date(startsAt).getTime() < Date.now() - 5 * 60_000) return fail("Choose a time in the future.");

    const mode = str(fd, "mode") === "in_person" ? "in_person" : "online";
    const venue = str(fd, "venue");
    if (mode === "in_person" && !venue) return fail("Enter the venue for an in-person session.", { venue: "Required" });
    const topic = str(fd, "topic");
    const brief = str(fd, "brief");
    if (round === "talk" && !topic) return fail("Enter the talk topic.", { topic: "Required" });
    if (round === "second_round" && !brief) return fail("Enter the presentation brief.", { brief: "Required" });

    const cand = db.select().from(users).where(eq(users.id, app.candidateId)).get()!;
    let meeting = { provider: "" as MeetingProvider | "", url: "", id: "", passcode: "", waitingRoom: true, simulated: false };
    if (mode === "online") {
      const provider = (PROVIDERS.includes(str(fd, "provider") as MeetingProvider) ? str(fd, "provider") : "zoom") as MeetingProvider;
      meeting = await createMeeting({ provider, topic: `${ROUND_LABELS[round]}: ${position.title} (${cand.name})`, startsAt, durationMin });
    }

    const row = db
      .insert(events)
      .values({
        positionId: position.id,
        panelId,
        applicationId: app.id,
        round,
        startsAt,
        durationMin,
        mode,
        venue,
        meetingProvider: meeting.provider,
        meetingUrl: meeting.url,
        meetingId: meeting.id,
        passcode: meeting.passcode,
        waitingRoom: meeting.waitingRoom,
        prepNote: str(fd, "prepNote"),
        topic,
        audience: str(fd, "audience"),
        brief,
        status: "invited",
      })
      .returning()
      .get();
    audit(user.id, "event_scheduled", "event", row.id, `${round} for ${app.appNo} at ${startsAt}${meeting.simulated ? " (simulated meeting link)" : ""}`);
    sendEventInvite(row.id);
    setApplicationStatus(app.id, round === "interview" ? "interview_scheduled" : "talk_scheduled", user.id, { notify: false, note: `${ROUND_LABELS[round]} invitation sent` });
    setStage(position.id, round === "interview" ? 7 : 8, user.id, `${ROUND_LABELS[round]} scheduled`);
    refresh(position.id, app.id);
    return done(
      `${ROUND_LABELS[round]} scheduled for ${cand.name} on ${formatDateTime(startsAt)} PKT. ${isPlaceholder(cand.email) ? "This candidate came through an agency, so contact them directly." : "The invitation has been emailed."}${meeting.simulated ? " The meeting link is simulated because no Zoom account is connected." : ""}`,
    );
  });
}

/** F4: moves one session. Other sessions are untouched. Candidate and panel are told. */
export async function rescheduleEventAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { e, position } = eventFor(user, num(fd, "eventId"));
    if (["cancelled", "completed", "declined"].includes(e.status)) return fail("This session can't be moved any more. Schedule a new one.");
    const startsAt = pktInputToIso(str(fd, "startsAt"));
    if (!startsAt) return fail("Enter the new date and time.");
    if (new Date(startsAt).getTime() < Date.now()) return fail("Choose a time in the future.");
    const reason = str(fd, "reason");
    db.update(events)
      .set({ startsAt, status: "invited", reminders: [], updatedAt: new Date().toISOString(), durationMin: num(fd, "durationMin", e.durationMin) || e.durationMin })
      .where(eq(events.id, e.id))
      .run();
    audit(user.id, "event_rescheduled", "event", e.id, `${e.startsAt} to ${startsAt}${reason ? `: ${reason}` : ""}`);
    sendRescheduleNotices(e.id);
    refresh(position.id, e.applicationId);
    return done(`Moved to ${formatDateTime(startsAt)} PKT. The candidate and panel have been told.`);
  });
}

/** HR records a confirmation received by phone, marks a session done, or cancels it. */
export async function setEventStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { e, position } = eventFor(user, num(fd, "eventId"));
    const to = str(fd, "status");
    if (!["confirmed", "completed", "cancelled"].includes(to)) return fail("Unknown status.");
    db.update(events)
      .set({ status: to as "confirmed", updatedAt: new Date().toISOString() })
      .where(eq(events.id, e.id))
      .run();
    audit(user.id, `event_${to}`, "event", e.id);
    if (to === "cancelled") {
      const r = loadEvent(e.id);
      if (r) {
        const subject = `Cancelled: ${sessionLabel(e.round)} for ${r.position.title}`;
        if (!isPlaceholder(r.candidate.email)) {
          sendEmail(
            { email: r.candidate.email, userId: r.candidate.id },
            subject,
            `Dear ${r.candidate.name},\n\nYour ${sessionLabel(e.round)} on ${formatDateTime(e.startsAt)} PKT has been cancelled. HR will be in touch about next steps.\n\nDU Human Resources`,
            { applicationId: e.applicationId, positionId: position.id },
          );
        }
        for (const m of eventPanelists(e)) {
          sendEmail({ email: m.user.email, userId: m.user.id }, subject, `Dear ${m.user.name},\n\nThe ${sessionLabel(e.round)} with ${r.candidate.name} on ${formatDateTime(e.startsAt)} PKT has been cancelled.\n\nDU Human Resources`, {
            applicationId: e.applicationId,
            positionId: position.id,
          });
        }
      }
    }
    refresh(position.id, e.applicationId);
    return done(to === "confirmed" ? "Marked as confirmed." : to === "completed" ? "Marked as completed." : "Session cancelled and everyone told.");
  });
}

/** F5: creates a fresh meeting link, for example after switching provider. */
export async function newMeetingLinkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(MANAGERS);
    const { e, position } = eventFor(user, num(fd, "eventId"));
    const provider = (PROVIDERS.includes(str(fd, "provider") as MeetingProvider) ? str(fd, "provider") : "zoom") as MeetingProvider;
    const r = loadEvent(e.id)!;
    const m = await createMeeting({ provider, topic: `${ROUND_LABELS[e.round]}: ${position.title} (${r.candidate.name})`, startsAt: e.startsAt, durationMin: e.durationMin });
    db.update(events)
      .set({ mode: "online", meetingProvider: m.provider, meetingUrl: m.url, meetingId: m.id, passcode: m.passcode, waitingRoom: m.waitingRoom, updatedAt: new Date().toISOString() })
      .where(eq(events.id, e.id))
      .run();
    audit(user.id, "meeting_link_created", "event", e.id, `${m.provider}${m.simulated ? " (simulated)" : ""}`);
    sendRescheduleNotices(e.id);
    refresh(position.id, e.applicationId);
    return done(`New ${provider === "zoom" ? "Zoom" : provider === "meet" ? "Google Meet" : "Teams"} link created and sent.${m.simulated ? " It is simulated because no account is connected." : ""}`);
  });
}
