import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getPendingUser } from "@/lib/auth";
import { verifySecondFactorAction } from "@/actions/auth";
import { AuthCard } from "@/components/layout/auth-card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { DemoOutbox } from "@/components/auth/demo-outbox";

export const metadata: Metadata = { title: "Enter your code" };

export default async function VerifyCodePage({ searchParams }: PageProps<"/login/verify">) {
  const pending = await getPendingUser();
  if (!pending) redirect("/login");
  const sp = await searchParams;
  return (
    <AuthCard title="Enter your code" description={`We emailed a 6-digit code to ${pending.user.email}. Staff accounts need it to sign in.`}>
      <ActionForm action={verifySecondFactorAction} className="grid gap-4">
        <input type="hidden" name="next" value={typeof sp.next === "string" ? sp.next : ""} />
        <Field label="Code" htmlFor="code">
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required autoFocus />
        </Field>
        <SubmitButton pendingText="Checking…">Continue</SubmitButton>
      </ActionForm>
      <DemoOutbox email={pending.user.email} templateKey="two_factor_code" />
    </AuthCard>
  );
}
