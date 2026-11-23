"use client";

import { useActionState, useEffect, useRef } from "react";
import type { ActionState } from "@/lib/action-state";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";

type Option = { value: string; label: string };

export type PersonalValues = {
  name: string;
  email: string;
  phone: string;
  cnic: string;
  dateOfBirth: string;
  gender: string;
  domicile: string;
  province: string;
  address: string;
  city: string;
  country: string;
  timezone: string;
  researchInterests: string;
};

export function PersonalForm({
  values,
  action,
  genders,
  provinces,
  timezones,
}: {
  values: PersonalValues;
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  genders: string[];
  provinces: string[];
  timezones: Option[];
}) {
  const [state, formAction] = useActionState(action, null);
  const err = state?.fieldErrors ?? {};
  const msgRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state) msgRef.current?.focus();
  }, [state]);
  return (
    <form action={formAction} className="grid gap-5">
      <div ref={msgRef} tabIndex={-1} className="outline-none empty:hidden">
        {state?.error && <Notice tone="error">{state.error}</Notice>}
        {state?.ok && <Notice tone="success">{state.message}</Notice>}
      </div>
      <FormGrid>
        <Field label="Full name" htmlFor="name" error={err.name} required>
          <Input id="name" name="name" autoComplete="name" defaultValue={values.name} required aria-invalid={!!err.name} />
        </Field>
        <Field label="Email" htmlFor="email" hint="Your sign-in email. Contact HR to change it.">
          <Input id="email" value={values.email} disabled readOnly />
        </Field>
        <Field label="Mobile number" htmlFor="phone" error={err.phone} required>
          <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={values.phone} required aria-invalid={!!err.phone} />
        </Field>
        <Field label="CNIC" htmlFor="cnic" hint="12345-1234567-1" error={err.cnic}>
          <Input id="cnic" name="cnic" inputMode="numeric" defaultValue={values.cnic} aria-invalid={!!err.cnic} />
        </Field>
        <Field label="Date of birth" htmlFor="dateOfBirth" error={err.dateOfBirth}>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" autoComplete="bday" defaultValue={values.dateOfBirth} aria-invalid={!!err.dateOfBirth} />
        </Field>
        <Field label="Gender" htmlFor="gender">
          <Select id="gender" name="gender" defaultValue={values.gender}>
            <option value="">Choose…</option>
            {genders.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Domicile (district)" htmlFor="domicile">
          <Input id="domicile" name="domicile" defaultValue={values.domicile} />
        </Field>
        <Field label="Province" htmlFor="province">
          <Select id="province" name="province" defaultValue={values.province}>
            <option value="">Choose…</option>
            {provinces.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Address" htmlFor="address" className="sm:col-span-2">
          <Input id="address" name="address" autoComplete="street-address" defaultValue={values.address} />
        </Field>
        <Field label="City" htmlFor="city">
          <Input id="city" name="city" autoComplete="address-level2" defaultValue={values.city} />
        </Field>
        <Field label="Country of residence" htmlFor="country">
          <Input id="country" name="country" autoComplete="country-name" defaultValue={values.country} />
        </Field>
        <Field label="Time zone" htmlFor="timezone" hint="Interview times are shown in Pakistan time and in this zone.">
          <Select id="timezone" name="timezone" defaultValue={values.timezone}>
            {timezones.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Research interests" htmlFor="researchInterests" hint="Faculty applicants" className="sm:col-span-2">
          <Textarea id="researchInterests" name="researchInterests" rows={2} defaultValue={values.researchInterests} />
        </Field>
      </FormGrid>
      <div>
        <SubmitButton>Save personal details</SubmitButton>
      </div>
    </form>
  );
}
