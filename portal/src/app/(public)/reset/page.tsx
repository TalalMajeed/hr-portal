import type { Metadata } from "next";
import { resetPasswordAction } from "@/actions/auth";
import { AuthCard } from "@/components/layout/auth-card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: PageProps<"/reset">) {
  const sp = await searchParams;
  return (
    <AuthCard title="Choose a new password">
      <ActionForm action={resetPasswordAction} className="grid gap-4">
        <input type="hidden" name="token" value={typeof sp.token === "string" ? sp.token : ""} />
        <Field label="New password" htmlFor="password" hint="At least 8 characters">
          <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm">
          <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <SubmitButton pendingText="Saving…">Save password</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
