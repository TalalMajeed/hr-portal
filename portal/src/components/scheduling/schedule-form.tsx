"use client";

import { useMemo, useState } from "react";
import type { PanelRound } from "@/lib/db/schema";
import { ROUND_LABELS } from "@/lib/constants";
import { formatDual } from "@/lib/format";
import { createEventAction } from "@/actions/scheduling";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

export type ScheduleCandidate = { id: number; name: string; appNo: string; tz: string; rounds: PanelRound[] };
export type SchedulePanel = {
  id: number;
  round: PanelRound;
  name: string;
  approved: boolean;
  slots: { id: number; startsAt: string; durationMin: number; available: number; total: number; taken: boolean }[];
};

/** F1, F2, F5, F7, F8: pick a candidate, a panel slot (shown in PKT and the candidate's zone) and send the invitation. */
export function ScheduleForm({ positionId, candidates, panels, rounds }: { positionId: number; candidates: ScheduleCandidate[]; panels: SchedulePanel[]; rounds: PanelRound[] }) {
  const [round, setRound] = useState<PanelRound>(rounds[0] ?? "interview");
  const eligible = useMemo(() => candidates.filter((c) => c.rounds.includes(round)), [candidates, round]);
  const [appId, setAppId] = useState<number | null>(null);
  const roundPanels = panels.filter((p) => p.round === round);
  const [panelId, setPanelId] = useState<number | null>(null);
  const [mode, setMode] = useState("online");
  const [slotId, setSlotId] = useState<string>("");

  const candidate = eligible.find((c) => c.id === appId) ?? eligible[0];
  const panel = roundPanels.find((p) => p.id === panelId) ?? roundPanels[0] ?? panels.find((p) => p.id === panelId) ?? null;
  const allPanels = roundPanels.length ? roundPanels : panels;
  const freeSlots = (panel?.slots ?? []).filter((s) => !s.taken);
  const ranked = [...freeSlots].sort((a, b) => b.available - a.available || a.startsAt.localeCompare(b.startsAt));

  return (
    <ActionForm action={createEventAction} className="grid gap-5">
      <input type="hidden" name="positionId" value={positionId} />
      <FormGrid cols={3}>
        <Field label="Session" htmlFor="sf-round">
          <Select
            id="sf-round"
            name="round"
            value={round}
            onChange={(e) => {
              setRound(e.target.value as PanelRound);
              setAppId(null);
              setPanelId(null);
              setSlotId("");
            }}
          >
            {rounds.map((r) => (
              <option key={r} value={r}>
                {ROUND_LABELS[r]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Candidate" htmlFor="sf-app" hint={round === "interview" ? "Shortlisted and reserve candidates" : "Candidates from round one"}>
          <Select id="sf-app" name="applicationId" value={candidate?.id ?? ""} onChange={(e) => setAppId(Number(e.target.value))}>
            {eligible.length === 0 && <option value="">No candidates ready for this session</option>}
            {eligible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.appNo})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Panel" htmlFor="sf-panel">
          <Select id="sf-panel" name="panelId" value={panel?.id ?? ""} onChange={(e) => { setPanelId(Number(e.target.value) || null); setSlotId(""); }}>
            {allPanels.length === 0 && <option value="">No panel yet</option>}
            {allPanels.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.approved ? "" : " (not approved yet)"}
              </option>
            ))}
          </Select>
        </Field>
      </FormGrid>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[15px] font-medium">
          Time {candidate && candidate.tz !== "Asia/Karachi" ? `(PKT, and ${candidate.name.split(" ")[0]}'s local time)` : "(PKT)"}
        </legend>
        {ranked.length > 0 ? (
          <div className="grid gap-2">
            {ranked.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer flex-wrap items-center justify-between gap-2 rounded-[4px] border border-line bg-white px-3 py-2.5 has-[:checked]:border-teal has-[:checked]:bg-tint"
              >
                <span className="flex items-center gap-3">
                  <input type="radio" name="slotId" value={s.id} checked={slotId === String(s.id)} onChange={() => setSlotId(String(s.id))} className="size-[18px] accent-teal" />
                  <span className="text-[15px]">{formatDual(s.startsAt, candidate?.tz)}</span>
                </span>
                <Badge tone={s.available === s.total && s.total > 0 ? "success" : s.available ? "warning" : "neutral"}>
                  {s.available} of {s.total} panel free
                </Badge>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-[15px] text-muted">No open slots from the availability poll for this panel. Enter a time below.</p>
        )}
        <label className="flex cursor-pointer items-center gap-3 rounded-[4px] border border-line bg-white px-3 py-2.5 has-[:checked]:border-teal has-[:checked]:bg-tint">
          <input type="radio" name="slotId" value="" checked={slotId === ""} onChange={() => setSlotId("")} className="size-[18px] accent-teal" />
          <span className="text-[15px]">Another time</span>
        </label>
        {slotId === "" && (
          <Field label="Date and time (PKT)" htmlFor="sf-start" className="max-w-xs">
            <Input id="sf-start" name="startsAt" type="datetime-local" />
          </Field>
        )}
      </fieldset>

      <FormGrid cols={3}>
        <Field label="Duration (minutes)" htmlFor="sf-dur">
          <Input id="sf-dur" name="durationMin" type="number" min={10} max={240} step={5} placeholder={round === "talk" ? "30" : "45"} />
        </Field>
        <Field label="Mode" htmlFor="sf-mode">
          <Select id="sf-mode" name="mode" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="online">Online</option>
            <option value="in_person">In person</option>
          </Select>
        </Field>
        {mode === "online" ? (
          <Field label="Video call" htmlFor="sf-provider" hint="Waiting room on">
            <Select id="sf-provider" name="provider" defaultValue="zoom">
              <option value="zoom">Zoom</option>
              <option value="meet">Google Meet</option>
              <option value="teams">Microsoft Teams</option>
            </Select>
          </Field>
        ) : (
          <Field label="Venue" htmlFor="sf-venue">
            <Input id="sf-venue" name="venue" placeholder="Committee Room 1, Admin Block" />
          </Field>
        )}
      </FormGrid>

      {round === "talk" && (
        <FormGrid>
          <Field label="Talk topic" htmlFor="sf-topic" required>
            <Input id="sf-topic" name="topic" />
          </Field>
          <Field label="Audience" htmlFor="sf-aud">
            <Select id="sf-aud" name="audience" defaultValue="Panel and faculty">
              <option>Panel only</option>
              <option>Panel and faculty</option>
              <option>Panel, faculty and students</option>
            </Select>
          </Field>
        </FormGrid>
      )}
      {round === "second_round" && (
        <Field label="Presentation brief" htmlFor="sf-brief" required hint="What the candidate should present">
          <Textarea id="sf-brief" name="brief" rows={3} defaultValue="A 10-minute plan for your first year in the role, followed by questions from the panel." />
        </Field>
      )}
      <Field label="What to prepare" htmlFor="sf-prep">
        <Textarea id="sf-prep" name="prepNote" rows={2} defaultValue={round === "interview" ? "Bring your CNIC and original degrees. Join five minutes early to test your audio." : ""} />
      </Field>
      <div>
        <SubmitButton pendingText="Scheduling…">Schedule and send invitation</SubmitButton>
      </div>
    </ActionForm>
  );
}
