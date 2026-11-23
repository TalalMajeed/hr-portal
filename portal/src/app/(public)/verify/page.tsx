import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { verifyEmail } from "@/actions/auth";
import { AuthCard } from "@/components/layout/auth-card";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const sp = await searchParams;
  const ok = await verifyEmail(typeof sp.token === "string" ? sp.token : "");
  if (ok) redirect("/login?verified=1");
  return (
    <AuthCard title="This link has expired" description="Verification links work once. If your account is already active, sign in; otherwise ask for a new link.">
      <Link href="/login">Go to sign in</Link>
    </AuthCard>
  );
}
