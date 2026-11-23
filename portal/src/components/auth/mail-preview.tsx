import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { mailConfigured } from "@/lib/email";
import { Notice } from "@/components/ui/notice";

/**
 * Until a mail provider is connected (RESEND_API_KEY), emails stay in the portal record.
 * So candidates can still activate their accounts, the sign-up page shows the
 * verification email here. It disappears as soon as real delivery is set up.
 * Use it only for account verification: never for password resets or sign-in codes.
 */
export async function VerificationPreview({ email }: { email: string }) {
  if (mailConfigured()) return null;
  const row = (await db
    .select()
    .from(emails)
    .where(and(eq(emails.toEmail, email), eq(emails.templateKey, "verify_email")))
    .orderBy(desc(emails.id))
    .limit(1))[0];
  const link = row?.body.match(/https?:\/\/\S+/)?.[0];
  if (!link) return null;
  return (
    <Notice tone="info" title="Email delivery isn't set up yet" className="mt-6">
      <p>Until DU connects its mail service, open your verification link here.</p>
      <p className="mt-2">
        <a href={link.replace(/^https?:\/\/[^/]+/, "")}>Verify my email</a>
      </p>
    </Notice>
  );
}
