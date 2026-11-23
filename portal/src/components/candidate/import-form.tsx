"use client";

import { useActionState, useEffect, useRef } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";
import type { ImportState } from "@/actions/import";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";

const SAMPLE = `name,email,phone,cnic,degree,level,field,institution,years,source,score
Asad Mir,asad.mir@example.com,+92 300 1234000,61101-1111111-1,MS Finance,MS,Finance,IBA Karachi,9,direct,72
Mariam Butt,,+92 321 5550000,35202-2222222-2,BS Accounting,BS,Accounting,Punjab University,6,agency,`;

export function ImportForm({
  action,
  positions,
}: {
  action: (prev: ImportState, fd: FormData) => Promise<ImportState>;
  positions: { id: number; label: string }[];
}) {
  const [state, formAction] = useActionState(action, null);
  const resultRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) resultRef.current?.focus();
  }, [state]);
  return (
    <div className="grid gap-6">
      <form action={formAction} className="grid gap-5">
        <Field label="Position" htmlFor="positionId" required>
          <Select id="positionId" name="positionId" required defaultValue="">
            <option value="" disabled>
              Choose a position…
            </option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="CSV file" htmlFor="file" hint="From Excel or Google Sheets: File, Download, Comma-separated values (.csv).">
          <Input id="file" name="file" type="file" accept=".csv,text/csv" className="h-auto py-2" />
        </Field>
        <Field label="Or paste the rows" htmlFor="csv" hint="The first row must be the header. Only name is required.">
          <Textarea id="csv" name="csv" rows={7} className="font-mono text-[15px]" placeholder={SAMPLE} />
        </Field>
        <div>
          <SubmitButton pendingText="Importing…">Import candidates</SubmitButton>
        </div>
      </form>

      <div ref={resultRef} tabIndex={-1} className="outline-none empty:hidden">
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        {state?.rows && (
          <div className="grid gap-3">
            <Notice tone={state.created ? "success" : "warning"} title={`${state.created} of ${state.rows.length} rows imported`} />
            <ul className="divide-y divide-line rounded-[10px] border border-line bg-white">
              {state.rows.map((r) => (
                <li key={r.line} className="flex items-start gap-3 px-4 py-3 text-[15px]">
                  {r.ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-label="Imported" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-label="Failed" />}
                  <span className="min-w-0">
                    <span className="font-semibold">
                      Row {r.line}: {r.name}
                    </span>
                    <span className="block text-muted">{r.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
