import { CalendarPlus, MapPin, Video } from "lucide-react";
import type { events as eventsTable } from "@/lib/db/schema";
import { ROUND_LABELS } from "@/lib/constants";
import { formatDual } from "@/lib/format";
import { respondToEventAction } from "@/actions/candidate";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { ButtonAnchor } from "@/components/ui/button";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { Field, Textarea } from "@/components/ui/field";

type Event = typeof eventsTable.$inferSelect;

/** An interview, faculty talk or second-round invitation, with the candidate's reply (F3). */
export function InvitationCard({ event, positionTitle, timezone }: { event: Event; positionTitle: string; timezone: string }) {
  const open = !["cancelled", "completed", "declined"].includes(event.status) && event.startsAt > new Date().toISOString();
  return (
    <article className="rounded-[10px] border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">{ROUND_LABELS[event.round]}</p>
          <p className="text-lg font-semibold">{positionTitle}</p>
        </div>
        <EventStatusBadge status={event.status} />
      </div>
      <dl className="mt-3 grid gap-2 text-[15px]">
        <div>
          <dt className="sr-only">When</dt>
          <dd className="font-semibold">{formatDual(event.startsAt, timezone)}</dd>
          <dd className="text-muted">{event.durationMin} minutes</dd>
        </div>
        {event.mode === "online" ? (
          <div className="flex items-start gap-2">
            <Video className="mt-1 size-4 shrink-0 text-teal" aria-hidden />
            <dd className="min-w-0 break-words">
              Online
              {event.meetingUrl && (
                <>
                  {": "}
                  <a href={event.meetingUrl} target="_blank" rel="noreferrer">
                    Join link
                  </a>
                </>
              )}
              {event.meetingId && <span className="block text-muted">Meeting ID {event.meetingId}</span>}
              {event.passcode && <span className="block text-muted">Passcode {event.passcode}</span>}
              {event.waitingRoom && event.meetingUrl && <span className="block text-muted">You will wait in a waiting room until the panel admits you.</span>}
            </dd>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <MapPin className="mt-1 size-4 shrink-0 text-teal" aria-hidden />
            <dd>In person{event.venue ? `: ${event.venue}` : ""}</dd>
          </div>
        )}
        {event.topic && (
          <div>
            <dt className="text-sm text-muted">Topic</dt>
            <dd>{event.topic}</dd>
          </div>
        )}
        {event.audience && (
          <div>
            <dt className="text-sm text-muted">Audience</dt>
            <dd>{event.audience}</dd>
          </div>
        )}
        {event.brief && (
          <div>
            <dt className="text-sm text-muted">Presentation brief</dt>
            <dd className="whitespace-pre-line">{event.brief}</dd>
          </div>
        )}
        {event.prepNote && (
          <div>
            <dt className="text-sm text-muted">What to prepare</dt>
            <dd className="whitespace-pre-line">{event.prepNote}</dd>
          </div>
        )}
        {event.candidateNote && (
          <div>
            <dt className="text-sm text-muted">Your note to HR</dt>
            <dd className="whitespace-pre-line">{event.candidateNote}</dd>
          </div>
        )}
      </dl>
      {event.status === "confirmed" && (
        <div className="mt-4">
          <ButtonAnchor href={`/api/events/${event.id}/ics`} variant="secondary" size="sm">
            <CalendarPlus aria-hidden /> Add to calendar
          </ButtonAnchor>
        </div>
      )}
      {open && (
        <ActionForm action={respondToEventAction} className="mt-4 border-t border-line pt-4">
          <input type="hidden" name="eventId" value={event.id} />
          <Field label="Note to HR" htmlFor={`note-${event.id}`} hint="Needed if you ask for another time: say which days and times suit you.">
            <Textarea id={`note-${event.id}`} name="note" rows={2} />
          </Field>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {event.status !== "confirmed" && (
              <SubmitButton name="intent" value="confirm" size="sm" pendingText="Sending…">
                Confirm
              </SubmitButton>
            )}
            <SubmitButton name="intent" value="reschedule" variant="secondary" size="sm" pendingText="Sending…">
              Ask for another time
            </SubmitButton>
            <ConfirmButton name="intent" value="decline" question="Decline this session?" confirmText="Yes, decline">
              Decline
            </ConfirmButton>
          </div>
        </ActionForm>
      )}
    </article>
  );
}
