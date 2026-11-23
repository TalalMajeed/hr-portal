import type { Metadata } from "next";
import Link from "next/link";
import { forgotPasswordAction } from "@/actions/auth";
import { AuthCard } from "@/components/layout/auth-card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter the email you registered with. We'll send a link to choose a new password."
      footer={<Link href="/login">Back to sign in</Link>}
    >
      <ActionForm action={forgotPasswordAction} className="grid gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton pendingText="Sending…">Send reset link</SubmitButton>
      </ActionForm>
    </AuthCard>
  );
}
