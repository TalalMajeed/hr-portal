import { CalendarPlus, ExternalLink } from "lucide-react";
import type { events, users } from "@/lib/db/schema";
import { ROUND_LABELS } from "@/lib/constants";
import { formatDual, isoToPktInput } from "@/lib/format";
import { PROVIDER_LABELS, isPast } from "@/lib/scheduling";
import { newMeetingLinkAction, rescheduleEventAction, setEventStatusAction } from "@/actions/scheduling";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Input, Select } from "@/components/ui/field";
import { EventStatusBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export type EventItem = { event: typeof events.$inferSelect; candidate: typeof users.$inferSelect; tz: string; appNo: string | null; panelName: string };

/** F3, F4, F5, F6: each session with its status, link, and per-session actions. */
export function EventList({ items }: { items: EventItem[] }) {
  return (
    <ul className="grid gap-3">
      {items.map(({ event: e, candidate, tz, appNo, panelName }) => {
        const open = !["cancelled", "completed", "declined"].includes(e.status);
        return (
          <li key={e.id} className="rounded-[10px] border border-line bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <p className="text-lg font-semibold">
                  <Link href={`/admin/applications/${e.applicationId}`}>{candidate.name}</Link>{" "}
                  <span className="text-[15px] font-normal text-muted">{appNo}</span>
                </p>
                <p className="text-[15px]">
                  {ROUND_LABELS[e.round]} · {e.durationMin} minutes{panelName ? ` · ${panelName}` : ""}
                </p>
                <p className="text-[15px] text-muted">{formatDual(e.startsAt, tz)}</p>
                {e.topic && <p className="text-[15px]">Topic: {e.topic}{e.audience ? ` · Audience: ${e.audience}` : ""}</p>}
                {e.brief && <p className="text-[15px]">Brief: {e.brief}</p>}
                {e.mode === "online" ? (
                  e.meetingUrl && (
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px]">
                      <a href={e.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
                        {PROVIDER_LABELS[e.meetingProvider] ?? "Meeting"} link <ExternalLink className="size-4" aria-hidden />
                      </a>
                      {e.passcode && <span className="text-muted">Passcode {e.passcode}</span>}
                      {e.waitingRoom && <Badge>Waiting room on</Badge>}
                      {e.meetingUrl.includes("simulated") && <Badge tone="sand">Simulated link</Badge>}
                    </p>
                  )
                ) : (
                  <p className="mt-1 text-[15px]">Venue: {e.venue}</p>
                )}
                {e.candidateNote && (
                  <p className="mt-2 rounded-[4px] bg-warning-tint px-3 py-2 text-[15px]">
                    Candidate&apos;s note: {e.candidateNote}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-2">
                <EventStatusBadge status={e.status} />
                {e.status === "confirmed" && (
                  <a href={`/api/events/${e.id}/ics`} className="inline-flex items-center gap-1 text-[15px]">
                    <CalendarPlus className="size-4" aria-hidden /> Calendar file
                  </a>
                )}
              </div>
            </div>
            {open && (
              <div className="flex flex-wrap items-start gap-2 border-t border-line px-5 py-3">
                {e.status !== "confirmed" && (
                  <ActionForm action={setEventStatusAction} showSuccess={false}>
                    <input type="hidden" name="eventId" value={e.id} />
                    <input type="hidden" name="status" value="confirmed" />
                    <SubmitButton size="sm" variant="ghost">
                      Mark confirmed
                    </SubmitButton>
                  </ActionForm>
                )}
                {isPast(e.startsAt) && (
                  <ActionForm action={setEventStatusAction} showSuccess={false}>
                    <input type="hidden" name="eventId" value={e.id} />
                    <input type="hidden" name="status" value="completed" />
                    <SubmitButton size="sm" variant="ghost">
                      Mark completed
                    </SubmitButton>
                  </ActionForm>
                )}
                <details className="w-full sm:w-auto">
                  <summary className="cursor-pointer py-1.5 text-[15px] font-semibold text-teal">
                    {e.status === "reschedule_requested" ? "Reschedule (requested)" : "Reschedule"}
                  </summary>
                  <ActionForm action={rescheduleEventAction} className="mt-3 grid gap-3 sm:min-w-96">
                    <input type="hidden" name="eventId" value={e.id} />
                    <Field label="New date and time (PKT)" htmlFor={`rs-${e.id}`}>
                      <Input id={`rs-${e.id}`} name="startsAt" type="datetime-local" defaultValue={isoToPktInput(e.startsAt)} required />
                    </Field>
                    <Field label="Reason" htmlFor={`rs-reason-${e.id}`}>
                      <Input id={`rs-reason-${e.id}`} name="reason" defaultValue={e.status === "reschedule_requested" ? "Candidate asked for another time" : ""} />
                    </Field>
                    <div>
                      <SubmitButton size="sm">Move and notify</SubmitButton>
                    </div>
                  </ActionForm>
                </details>
                {e.mode === "online" && (
                  <details className="w-full sm:w-auto">
                    <summary className="cursor-pointer py-1.5 text-[15px] font-semibold text-teal">New meeting link</summary>
                    <ActionForm action={newMeetingLinkAction} className="mt-3 flex flex-wrap items-end gap-3">
                      <input type="hidden" name="eventId" value={e.id} />
                      <Field label="Provider" htmlFor={`ml-${e.id}`}>
                        <Select id={`ml-${e.id}`} name="provider" defaultValue={e.meetingProvider || "zoom"}>
                          <option value="zoom">Zoom</option>
                          <option value="meet">Google Meet</option>
                          <option value="teams">Microsoft Teams</option>
                        </Select>
                      </Field>
                      <SubmitButton size="sm" variant="secondary">
                        Create and send
                      </SubmitButton>
                    </ActionForm>
                  </details>
                )}
                <ActionForm action={setEventStatusAction} showSuccess={false} className="ml-auto">
                  <input type="hidden" name="eventId" value={e.id} />
                  <input type="hidden" name="status" value="cancelled" />
                  <ConfirmButton question="Cancel and tell everyone?" confirmText="Cancel session">
                    Cancel
                  </ConfirmButton>
                </ActionForm>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
