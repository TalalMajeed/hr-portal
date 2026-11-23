import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/constants";
import { signInAction } from "@/actions/auth";
import { AuthCard } from "@/components/layout/auth-card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/notice";
import { DemoLogins } from "@/components/auth/demo-logins";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const user = await getUser();
  if (user) redirect(ROLE_HOME[user.role]);
  const sp = await searchParams;
  const next = typeof sp.next === "string" ? sp.next : "";
  return (
    <AuthCard
      title="Sign in"
      description="Candidates, DU staff, agencies and Selection Board members sign in here."
      footer={
        <>
          New to DU careers? <Link href="/register">Create an account</Link>
        </>
      }
    >
      {sp.reset && <Notice tone="success" className="mb-4">Password changed. Sign in with your new password.</Notice>}
      {sp.verified && <Notice tone="success" className="mb-4">Email verified. You can sign in now.</Notice>}
      {sp.link === "invalid" && <Notice tone="error" className="mb-4">That secure link has expired or was replaced. Ask DU HR for a new one.</Notice>}
      <ActionForm action={signInAction} className="grid gap-4">
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
          <Link href="/forgot" className="text-[15px]">
            Forgot password?
          </Link>
        </div>
      </ActionForm>
      <DemoLogins />
    </AuthCard>
  );
}
