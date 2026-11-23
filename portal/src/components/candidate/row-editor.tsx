"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { ActionState } from "@/lib/action-state";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/components/ui/cn";

export type RowField = {
  key: string;
  label: string;
  type?: "text" | "select" | "date" | "number" | "textarea" | "checkbox";
  options?: { value: string; label: string }[];
  wide?: boolean;
  hint?: string;
  placeholder?: string;
  required?: boolean;
  inputMode?: "numeric" | "text" | "url";
};

type Value = string | number | boolean;
type Row = { id: number; values: Record<string, Value> };

/**
 * Edits a list of entries (qualifications, jobs, publications, references) and
 * saves the whole list in one go as JSON.
 */
export function RowEditor({
  section,
  fields,
  initial,
  blank,
  itemLabel,
  addLabel,
  emptyText,
  action,
}: {
  section: string;
  fields: RowField[];
  initial: Record<string, Value>[];
  blank: Record<string, Value>;
  itemLabel: string;
  addLabel: string;
  emptyText: string;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
}) {
  const nextId = useRef(initial.length + 1);
  const [rows, setRows] = useState<Row[]>(() => initial.map((values, i) => ({ id: i + 1, values })));
  const [state, formAction] = useActionState(action, null);
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) msgRef.current?.focus();
  }, [state]);

  const update = (id: number, key: string, value: Value) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, values: { ...r.values, [key]: value } } : r)));
  const add = () => setRows((rs) => [...rs, { id: nextId.current++, values: { ...blank } }]);
  const remove = (id: number) => setRows((rs) => rs.filter((r) => r.id !== id));

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="rows" value={JSON.stringify(rows.map((r) => r.values))} />
      <div ref={msgRef} tabIndex={-1} className="outline-none empty:hidden">
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        {state?.ok && <Notice tone="success">{state.message}</Notice>}
      </div>
      {rows.length === 0 && <p className="text-[15px] text-muted">{emptyText}</p>}
      {rows.map((row, index) => (
        <fieldset key={row.id} className="rounded-[10px] border border-line bg-off/60 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <legend className="text-[15px] font-semibold">
              {itemLabel} {index + 1}
            </legend>
            <Button variant="ghost" size="sm" onClick={() => remove(row.id)} aria-label={`Remove ${itemLabel.toLowerCase()} ${index + 1}`}>
              <Trash2 aria-hidden /> Remove
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((f) => {
              const id = `${section}-${row.id}-${f.key}`;
              const v = row.values[f.key];
              const disabled = f.key === "to" && row.values.current === true;
              if (f.type === "checkbox") {
                return (
                  <div key={f.key} className={cn("flex items-end", f.wide && "sm:col-span-2")}>
                    <Checkbox id={id} label={f.label} checked={v === true} onChange={(e) => update(row.id, f.key, e.target.checked)} />
                  </div>
                );
              }
              return (
                <Field key={f.key} label={f.label} htmlFor={id} hint={f.hint} required={f.required} className={cn(f.wide && "sm:col-span-2")}>
                  {f.type === "select" ? (
                    <Select id={id} value={String(v ?? "")} onChange={(e) => update(row.id, f.key, e.target.value)}>
                      {f.options?.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  ) : f.type === "textarea" ? (
                    <Textarea id={id} rows={3} value={String(v ?? "")} placeholder={f.placeholder} onChange={(e) => update(row.id, f.key, e.target.value)} />
                  ) : (
                    <Input
                      id={id}
                      type={f.type === "date" ? "date" : f.type === "number" ? "number" : "text"}
                      inputMode={f.inputMode}
                      min={f.type === "number" ? 1 : undefined}
                      value={String(v ?? "")}
                      placeholder={f.placeholder}
                      disabled={disabled}
                      onChange={(e) => update(row.id, f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
                    />
                  )}
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={add}>
          <Plus aria-hidden /> {addLabel}
        </Button>
        <SubmitButton>Save {section}</SubmitButton>
      </div>
    </form>
  );
}
