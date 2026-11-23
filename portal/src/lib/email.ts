import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails, emailTemplates } from "@/lib/db/schema";
import { audit } from "@/lib/audit";

export const FROM_ADDRESS = "careers@du.edu.pk";

export function appUrl(path = "") {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}${path}`;
}

/** Replaces {{name}} placeholders. Unknown placeholders are left blank. */
export function renderTemplate(text: string, vars: Record<string, string | number | null | undefined>) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const v = vars[key];
    return v === null || v === undefined ? "" : String(v);
  });
}

type Recipient = { email: string; userId?: number | null };
type Context = { applicationId?: number | null; positionId?: number | null; attachments?: { name: string; url: string }[] };

/**
 * Sends an email. There is no mail server in this build: every email is stored in the
 * outbox, which HR sees under Emails and the candidate sees under Messages.
 */
export function sendEmail(to: Recipient, subject: string, body: string, ctx: Context & { templateKey?: string } = {}) {
  const row = db
    .insert(emails)
    .values({
      toEmail: to.email,
      toUserId: to.userId ?? null,
      subject,
      body,
      templateKey: ctx.templateKey ?? "",
      applicationId: ctx.applicationId ?? null,
      positionId: ctx.positionId ?? null,
      attachments: ctx.attachments ?? [],
    })
    .returning({ id: emails.id })
    .get();
  audit(null, "email_sent", "email", row.id, `${ctx.templateKey || "custom"} to ${to.email}: ${subject}`);
  return row.id;
}

/** Sends an email from an HR-editable template. */
export function sendTemplate(key: string, to: Recipient, vars: Record<string, string | number | null | undefined>, ctx: Context = {}) {
  const tpl = db.select().from(emailTemplates).where(eq(emailTemplates.key, key)).get();
  if (!tpl) throw new Error(`Email template "${key}" is missing.`);
  const allVars = { portal_url: appUrl(), ...vars };
  return sendEmail(to, renderTemplate(tpl.subject, allVars), renderTemplate(tpl.body, allVars), { ...ctx, templateKey: key });
}
