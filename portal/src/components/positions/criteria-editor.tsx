"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { Criterion, CriterionType } from "@/lib/db/schema";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

const TYPES: { value: CriterionType; label: string; valueLabel: string }[] = [
  { value: "qualification", label: "Minimum qualification", valueLabel: "Degree level" },
  { value: "experience", label: "Years of experience", valueLabel: "Minimum years" },
  { value: "cgpa", label: "Minimum CGPA or division", valueLabel: "CGPA out of 4" },
  { value: "age", label: "Age limit", valueLabel: "Maximum age" },
  { value: "document", label: "Mandatory document", valueLabel: "Document" },
  { value: "custom", label: "Other condition", valueLabel: "" },
];

/** A6: builds the criteria list. The rows are sent to the server as JSON. */
export function CriteriaEditor({
  initial,
  degreeLevels,
  documentKinds,
}: {
  initial: Criterion[];
  degreeLevels: { value: string; label: string }[];
  documentKinds: { value: string; label: string }[];
}) {
  const [items, setItems] = useState<Criterion[]>(initial);
  const update = (i: number, patch: Partial<Criterion>) => setItems((xs) => xs.map((x, n) => (n === i ? { ...x, ...patch } : x)));
  const add = () => setItems((xs) => [...xs, { key: "", type: "qualification", label: "", value: "", mandatory: true }]);

  return (
    <div className="grid gap-4">
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      {items.length === 0 && <p className="text-muted">No criteria yet. Add the minimum qualification, experience and any other condition.</p>}
      <ol className="grid gap-4">
        {items.map((c, i) => {
          const t = TYPES.find((x) => x.value === c.type)!;
          return (
            <li key={i} className="rounded-[10px] border border-line bg-white p-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Type" htmlFor={`c-type-${i}`}>
                  <Select id={`c-type-${i}`} value={c.type} onChange={(e) => update(i, { type: e.target.value as CriterionType, value: "" })}>
                    {TYPES.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Wording shown to candidates" htmlFor={`c-label-${i}`} className="sm:col-span-1 lg:col-span-3">
                  <Input id={`c-label-${i}`} value={c.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="For example: PhD in Mathematics" />
                </Field>
                {c.type === "qualification" && (
                  <>
                    <Field label={t.valueLabel} htmlFor={`c-val-${i}`}>
                      <Select id={`c-val-${i}`} value={c.value} onChange={(e) => update(i, { value: e.target.value })}>
                        <option value="">Choose</option>
                        {degreeLevels.map((d) => (
                          <option key={d.value} value={d.value}>
                            {d.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Field of study" htmlFor={`c-field-${i}`} hint="Comma separated; blank means any" className="lg:col-span-2">
                      <Input id={`c-field-${i}`} value={c.field ?? ""} onChange={(e) => update(i, { field: e.target.value })} placeholder="mathematics, statistics" />
                    </Field>
                  </>
                )}
                {(c.type === "experience" || c.type === "cgpa" || c.type === "age") && (
                  <Field label={t.valueLabel} htmlFor={`c-val-${i}`}>
                    <Input
                      id={`c-val-${i}`}
                      type="number"
                      inputMode="decimal"
                      step={c.type === "cgpa" ? "0.1" : "1"}
                      min={0}
                      value={c.value}
                      onChange={(e) => update(i, { value: e.target.value })}
                    />
                  </Field>
                )}
                {c.type === "age" && (
                  <Field label="Cut-off date" htmlFor={`c-cut-${i}`}>
                    <Input id={`c-cut-${i}`} type="date" value={c.cutoffDate ?? ""} onChange={(e) => update(i, { cutoffDate: e.target.value })} />
                  </Field>
                )}
                {c.type === "document" && (
                  <Field label={t.valueLabel} htmlFor={`c-val-${i}`}>
                    <Select id={`c-val-${i}`} value={c.value} onChange={(e) => update(i, { value: e.target.value })}>
                      <option value="">Choose</option>
                      {documentKinds.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <fieldset className="flex flex-wrap gap-4">
                  <legend className="sr-only">Mandatory or desirable</legend>
                  {[true, false].map((m) => (
                    <label key={String(m)} className="flex cursor-pointer items-center gap-2 text-[15px]">
                      <input type="radio" className="size-[18px] accent-teal" checked={c.mandatory === m} onChange={() => update(i, { mandatory: m })} />
                      {m ? "Mandatory" : "Desirable"}
                    </label>
                  ))}
                </fieldset>
                <Button variant="ghost" size="sm" onClick={() => setItems((xs) => xs.filter((_, n) => n !== i))}>
                  <Trash2 aria-hidden /> Remove
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <div>
        <Button variant="secondary" size="sm" onClick={add}>
          <Plus aria-hidden /> Add a criterion
        </Button>
      </div>
    </div>
  );
}
