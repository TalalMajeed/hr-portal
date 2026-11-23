import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails } from "@/lib/db/schema";
import { Notice } from "@/components/ui/notice";

/**
 * Demo build only. No mail server is connected, so this shows the latest email of a
 * given kind sent to an address, so a judge can follow the link or read the code.
 */
export function DemoOutbox({ email, templateKey }: { email: string; templateKey: string }) {
  if (process.env.DEMO_LOGINS === "off") return null;
  const row = db
    .select()
    .from(emails)
    .where(and(eq(emails.toEmail, email), eq(emails.templateKey, templateKey)))
    .orderBy(desc(emails.id))
    .get();
  if (!row) return null;
  const link = row.body.match(/https?:\/\/\S+/)?.[0];
  return (
    <Notice tone="info" title="Demo build: no mail server is connected" className="mt-6">
      <p>This is the email we just sent to {email}:</p>
      <pre className="mt-2 whitespace-pre-wrap break-words font-sans text-[15px] text-ink">{row.body}</pre>
      {link && (
        <p className="mt-2">
          <a href={link.replace(/^https?:\/\/[^/]+/, "")}>Open the link</a>
        </p>
      )}
    </Notice>
  );
}
