import type { Metadata } from "next";
import Form from "next/form";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { emails, emailTemplates } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { FROM_ADDRESS, mailConfigured } from "@/lib/email";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Emails" };

export default async function EmailsPage({ searchParams }: PageProps<"/admin/emails">) {
  await requireUser(["super_admin", "hr"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const where: SQL[] = [];
  if (q) where.push(or(ilike(emails.toEmail, `%${q}%`), ilike(emails.subject, `%${q}%`))!);
  if (kind) where.push(eq(emails.templateKey, kind));
  const rows = (await db.select().from(emails).where(where.length ? and(...where) : undefined).orderBy(desc(emails.id)).limit(200));
  const kinds = (await db.select({ key: emailTemplates.key, name: emailTemplates.name }).from(emailTemplates));
  const names = new Map(kinds.map((k) => [k.key, k.name]));

  return (
    <>
      <PageHeader title="Emails" description={`Every email the portal sent, from ${FROM_ADDRESS}. A copy stays with the record.`} />
      {!mailConfigured() && (
        <Notice tone="warning" className="mb-5">
          Email delivery isn&apos;t connected yet, so these emails are stored here and in each candidate&apos;s messages but not sent. Set RESEND_API_KEY to deliver them.
        </Notice>
      )}
      <Form action="/admin/emails" className="mb-5 grid gap-3 rounded-[10px] border border-line bg-white p-4 sm:grid-cols-[2fr_1fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Search recipient or subject" aria-label="Search" />
        <Select name="kind" defaultValue={kind} aria-label="Kind">
          <option value="">All kinds</option>
          {kinds.map((k) => (
            <option key={k.key} value={k.key}>
              {k.name}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </Form>
      {rows.length === 0 ? (
        <EmptyState title="No emails match">Try another search.</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {rows.map((e) => (
            <li key={e.id}>
              <details className="rounded-[10px] border border-line bg-white">
                <summary className="flex cursor-pointer flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{e.subject}</span>
                    <span className="block truncate text-sm text-muted">To {e.toEmail}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge>{names.get(e.templateKey) ?? (e.templateKey || "Custom")}</Badge>
                    <span className="text-sm text-muted">{formatDateTime(e.createdAt)}</span>
                  </span>
                </summary>
                <pre className="whitespace-pre-wrap break-words border-t border-line px-5 py-4 font-sans text-[15px]">{e.body}</pre>
              </details>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
