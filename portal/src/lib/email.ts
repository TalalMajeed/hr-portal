import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails, emailTemplates } from "@/lib/db/schema";
import { audit } from "@/lib/audit";

export const FROM_ADDRESS = process.env.MAIL_FROM ?? "careers@du.edu.pk";

/** True when real delivery is set up. Without it, emails are kept in the portal record only. */
export function mailConfigured() {
  return !!process.env.RESEND_API_KEY;
}

/** Delivers through Resend's HTTP API. Failures are logged; the copy in the record stays either way. */
async function deliver(to: string, subject: string, body: string, emailId: number) {
  if (!mailConfigured() || to.endsWith("@placeholder.local")) return;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Daanish University <${FROM_ADDRESS}>`, to: [to], subject, text: body }),
    });
    if (!res.ok) await audit(null, "email_failed", "email", emailId, `${res.status} ${(await res.text()).slice(0, 200)}`);
  } catch (e) {
    await audit(null, "email_failed", "email", emailId, e instanceof Error ? e.message : "Unknown error");
  }
}

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
 * Sends an email and keeps a copy in the record (HR sees it under Emails, the candidate
 * under Messages). Delivery happens only when RESEND_API_KEY is set.
 */
export async function sendEmail(to: Recipient, subject: string, body: string, ctx: Context & { templateKey?: string } = {}) {
  const row = (await db
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
    )[0];
  await audit(null, "email_sent", "email", row.id, `${ctx.templateKey || "custom"} to ${to.email}: ${subject}`);
  await deliver(to.email, subject, body, row.id);
  return row.id;
}

/** Sends an email from an HR-editable template. */
export async function sendTemplate(key: string, to: Recipient, vars: Record<string, string | number | null | undefined>, ctx: Context = {}) {
  const tpl = (await db.select().from(emailTemplates).where(eq(emailTemplates.key, key)))[0];
  if (!tpl) throw new Error(`Email template "${key}" is missing.`);
  const allVars = { portal_url: appUrl(), ...vars };
  return await sendEmail(to, renderTemplate(tpl.subject, allVars), renderTemplate(tpl.body, allVars), { ...ctx, templateKey: key });
}
