import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { events } from "@/lib/db/schema";
import { formatDateTime, formatDual } from "@/lib/format";
import { PKT } from "@/lib/constants";
import { sendTemplate } from "@/lib/email";
import { eventLocationText, eventPanelists, isPlaceholder, loadEvent, sessionLabel } from "@/lib/scheduling";

const HOUR = 3_600_000;

function pktDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: PKT, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * F10: sends reminders 24 hours and 1 hour before each session, and a joining note on the day,
 * to the candidate and the panel. Sent keys are stored on the event so nothing goes twice.
 * Returns how many emails were sent.
 */
export function runDueReminders(now = new Date()) {
  const due = db
    .select()
    .from(events)
    .where(inArray(events.status, ["invited", "confirmed", "reschedule_requested"]))
    .all()
    .filter((e) => {
      const t = new Date(e.startsAt).getTime();
      return t > now.getTime() && t - now.getTime() <= 24 * HOUR;
    });
  let sent = 0;
  for (const e of due) {
    const left = new Date(e.startsAt).getTime() - now.getTime();
    const done = new Set(e.reminders);
    const keys: string[] = [];
    if (left <= HOUR) {
      if (!done.has("1h")) keys.push("1h");
      done.add("24h");
      done.add("day");
    } else {
      if (!done.has("24h")) keys.push("24h");
      if (!done.has("day") && pktDate(now) === pktDate(new Date(e.startsAt))) keys.push("day");
    }
    if (!keys.length) {
      if (done.size !== e.reminders.length) db.update(events).set({ reminders: [...done] }).where(eq(events.id, e.id)).run();
      continue;
    }
    const r = loadEvent(e.id);
    if (!r) continue;
    // Send one email per run: the closest reminder that is due.
    const key = keys.includes("1h") ? "1h" : keys.includes("day") ? "day" : "24h";
    const relative = key === "1h" ? "in one hour" : key === "day" ? "today" : "tomorrow";
    const base = { position: r.position.title, when_relative: relative, venue_or_link: eventLocationText(e) };
    if (!isPlaceholder(r.candidate.email)) {
      sendTemplate(
        "event_reminder",
        { email: r.candidate.email, userId: r.candidate.id },
        { ...base, name: r.candidate.name, session: sessionLabel(e.round), when: formatDual(e.startsAt, r.tz) },
        { applicationId: r.app.id, positionId: r.position.id },
      );
      sent += 1;
    }
    for (const m of eventPanelists(e)) {
      sendTemplate(
        "event_reminder",
        { email: m.user.email, userId: m.user.id },
        { ...base, name: m.user.name, session: `${sessionLabel(e.round)} with ${r.candidate.name}`, when: `${formatDateTime(e.startsAt)} PKT` },
        { applicationId: r.app.id, positionId: r.position.id },
      );
      sent += 1;
    }
    for (const k of keys) done.add(k);
    db.update(events).set({ reminders: [...done] }).where(eq(events.id, e.id)).run();
  }
  return sent;
}
