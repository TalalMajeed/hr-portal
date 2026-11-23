"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action-state";
import { Field, FormGrid, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";

/** B6: an agency adds a sourced candidate and their CV. */
export function AgencyCandidateForm({
  positionId,
  action,
  levels,
  accept,
}: {
  positionId: number;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  levels: { value: string; label: string }[];
  accept: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const err = state?.fieldErrors ?? {};
  const formRef = useRef<HTMLFormElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!state) return;
    if (state.ok) formRef.current?.reset();
    msgRef.current?.focus();
  }, [state]);
  return (
    <form ref={formRef} action={formAction} className="grid gap-5">
      <input type="hidden" name="positionId" value={positionId} />
      <div ref={msgRef} tabIndex={-1} className="outline-none empty:hidden">
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        {state?.ok && <Notice tone="success">{state.message}</Notice>}
      </div>
      <FormGrid>
        <Field label="Full name" htmlFor="name" error={err.name} required>
          <Input id="name" name="name" required aria-invalid={!!err.name} />
        </Field>
        <Field label="Mobile number" htmlFor="phone" error={err.phone} required>
          <Input id="phone" name="phone" type="tel" inputMode="tel" required aria-invalid={!!err.phone} />
        </Field>
        <Field label="CNIC" htmlFor="cnic" hint="12345-1234567-1, used to spot duplicates" error={err.cnic}>
          <Input id="cnic" name="cnic" inputMode="numeric" aria-invalid={!!err.cnic} />
        </Field>
        <Field label="Email" htmlFor="email" hint="Optional. Without it the candidate gets no emails." error={err.email}>
          <Input id="email" name="email" type="email" aria-invalid={!!err.email} />
        </Field>
        <Field label="Highest degree" htmlFor="degree">
          <Input id="degree" name="degree" placeholder="MS Supply Chain Management" />
        </Field>
        <Field label="Degree level" htmlFor="level">
          <Select id="level" name="level" defaultValue="5">
            {levels.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Field of study" htmlFor="field">
          <Input id="field" name="field" />
        </Field>
        <Field label="Institution" htmlFor="institution">
          <Input id="institution" name="institution" />
        </Field>
        <Field label="Years of relevant experience" htmlFor="years">
          <Input id="years" name="years" type="number" min={0} max={50} inputMode="numeric" defaultValue={0} />
        </Field>
        <Field label="CV" htmlFor="cv" hint="PDF, JPG or PNG" error={err.cv} required>
          <Input id="cv" name="cv" type="file" accept={accept} required className="h-auto py-2" aria-invalid={!!err.cv} />
        </Field>
      </FormGrid>
      <div>
        <SubmitButton pendingText="Adding…">Add candidate</SubmitButton>
      </div>
    </form>
  );
}
