"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { RoundKind, RubricContent, RubricItem } from "@/lib/db/schema";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";

const ROUNDS: { key: RoundKind; label: string }[] = [
  { key: "shortlisting", label: "Shortlisting" },
  { key: "interview", label: "Interview" },
  { key: "talk", label: "Faculty talk" },
  { key: "second_round", label: "Second round" },
];

/** A7: one rubric per round, weights adding up to 100. Sent to the server as JSON. */
export function RubricEditor({ initial }: { initial: RubricContent }) {
  const [rubric, setRubric] = useState<RubricContent>(initial);
  const [round, setRound] = useState<RoundKind>("shortlisting");
  const items = rubric[round];
  const total = items.reduce((s, i) => s + (Number(i.weight) || 0), 0);
  const setItems = (fn: (xs: RubricItem[]) => RubricItem[]) => setRubric((r) => ({ ...r, [round]: fn(r[round]) }));
  const update = (i: number, patch: Partial<RubricItem>) => setItems((xs) => xs.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  return (
    <div className="grid gap-4">
      <input type="hidden" name="rubric" value={JSON.stringify(rubric)} />
      <div role="tablist" aria-label="Round" className="flex flex-wrap gap-2">
        {ROUNDS.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={round === r.key}
            onClick={() => setRound(r.key)}
            className={cn(
              "min-h-10 rounded-[4px] border px-3 text-[15px] font-semibold transition-colors duration-150",
              round === r.key ? "border-teal bg-tint text-teal-dark" : "border-line bg-white text-ink hover:border-teal",
            )}
          >
            {r.label} <span className="font-normal text-muted">({rubric[r.key].length})</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-[10px] border border-line bg-white">
        <table className="w-full min-w-[560px] text-left text-[15px]">
          <thead className="border-b border-line bg-off text-muted">
            <tr>
              <th className="px-3 py-2.5 font-semibold">Criterion</th>
              <th className="w-28 px-3 py-2.5 font-semibold">Weight %</th>
              <th className="w-28 px-3 py-2.5 font-semibold">Max score</th>
              <th className="w-28 px-3 py-2.5 font-semibold">Min score</th>
              <th className="w-14 px-3 py-2.5">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                <td className="px-3 py-2">
                  <Input aria-label="Criterion" value={it.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="For example: Subject knowledge" />
                </td>
                <td className="px-3 py-2">
                  <Input aria-label="Weight" type="number" inputMode="numeric" min={0} max={100} value={it.weight} onChange={(e) => update(i, { weight: Number(e.target.value) })} />
                </td>
                <td className="px-3 py-2">
                  <Input aria-label="Maximum score" type="number" inputMode="numeric" min={1} value={it.maxScore} onChange={(e) => update(i, { maxScore: Number(e.target.value) })} />
                </td>
                <td className="px-3 py-2">
                  <Input aria-label="Minimum score" type="number" inputMode="numeric" min={0} value={it.minScore} onChange={(e) => update(i, { minScore: Number(e.target.value) })} />
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    aria-label={`Remove ${it.label || "criterion"}`}
                    onClick={() => setItems((xs) => xs.filter((_, n) => n !== i))}
                    className="inline-flex size-10 items-center justify-center rounded-[4px] text-muted hover:bg-off hover:text-danger"
                  >
                    <Trash2 className="size-5" />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-muted">
                  No criteria for this round yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="sm" onClick={() => setItems((xs) => [...xs, { key: "", label: "", weight: 0, maxScore: 10, minScore: 0 }])}>
          <Plus aria-hidden /> Add a criterion
        </Button>
        <p className={cn("text-[15px] font-semibold tabular-nums", items.length && total !== 100 ? "text-danger" : "text-success")}>
          Weights total {total} of 100
        </p>
      </div>
    </div>
  );
}
