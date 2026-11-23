"use client";

import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  timezones: { value: string; label: string }[];
};

export function RegisterForm({ action, timezones }: Props) {
  const [state, formAction] = useActionState(action, null);
  const err = state?.fieldErrors ?? {};
  const guessed = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Karachi";
  const tzDefault = timezones.some((t) => t.value === guessed) ? guessed : "Asia/Karachi";
  return (
    <form action={formAction} className="grid gap-4">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      <Field label="Full name" htmlFor="name" error={err.name} required>
        <Input id="name" name="name" autoComplete="name" required aria-invalid={!!err.name} />
      </Field>
      <Field label="Email" htmlFor="email" error={err.email} required>
        <Input id="email" name="email" type="email" autoComplete="email" required aria-invalid={!!err.email} />
      </Field>
      <Field label="Mobile number" htmlFor="phone" hint="With country code, such as +92 300 1234567" error={err.phone} required>
        <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required aria-invalid={!!err.phone} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Country of residence" htmlFor="country">
          <Input id="country" name="country" autoComplete="country-name" defaultValue="Pakistan" />
        </Field>
        <Field label="Time zone" htmlFor="timezone" hint="Used to show interview times">
          <Select id="timezone" name="timezone" defaultValue={tzDefault}>
            {timezones.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Password" htmlFor="password" hint="At least 8 characters" error={err.password} required>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required aria-invalid={!!err.password} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={err.confirm} required>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required aria-invalid={!!err.confirm} />
      </Field>
      <SubmitButton pendingText="Creating account…">Create account</SubmitButton>
    </form>
  );
}
