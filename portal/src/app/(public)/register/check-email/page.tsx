import type { Metadata } from "next";
import { resendVerificationAction } from "@/actions/auth";
import { AuthCard } from "@/components/layout/auth-card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { DemoOutbox } from "@/components/auth/demo-outbox";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmailPage({ searchParams }: PageProps<"/register/check-email">) {
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  return (
    <AuthCard title="Check your email" description={`We sent a verification link to ${email || "your email address"}. Open it to activate your account.`}>
      <ActionForm action={resendVerificationAction}>
        <input type="hidden" name="email" value={email} />
        <SubmitButton variant="secondary" pendingText="Sending…">
          Send a new link
        </SubmitButton>
      </ActionForm>
      {email && <DemoOutbox email={email} templateKey="verify_email" />}
    </AuthCard>
  );
}
