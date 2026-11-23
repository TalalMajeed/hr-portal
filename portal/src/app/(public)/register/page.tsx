import type { Metadata } from "next";
import Link from "next/link";
import { registerAction } from "@/actions/auth";
import { TIMEZONES } from "@/lib/constants";
import { AuthCard } from "@/components/layout/auth-card";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <AuthCard
      title="Create an account"
      description="One profile for every DU application. You'll verify your email before you can apply."
      footer={
        <>
          Already registered? <Link href="/login">Sign in</Link>
        </>
      }
    >
      <RegisterForm action={registerAction} timezones={TIMEZONES} />
    </AuthCard>
  );
}
