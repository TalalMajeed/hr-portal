import type { Metadata } from "next";
import Form from "next/form";
import { and, desc, eq, ilike, lt, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Select } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 100;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireUser(["super_admin", "ed"]);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const entity = typeof sp.entity === "string" ? sp.entity : "";
  const before = typeof sp.before === "string" ? Number(sp.before) : 0;
  const where: SQL[] = [];
  if (q) where.push(or(ilike(auditLog.action, `%${q}%`), ilike(auditLog.detail, `%${q}%`), ilike(users.name, `%${q}%`))!);
  if (entity) where.push(eq(auditLog.entity, entity));
  if (before) where.push(lt(auditLog.id, before));
  const rows = (await db
    .select({ a: auditLog, name: users.name })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(PAGE)
    );
  const entities = ["application", "position", "document", "user", "email", "report", "settings"];
  const next = rows.length === PAGE ? rows[rows.length - 1].a.id : null;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(q && { q }), ...(entity && { entity }), ...extra }).toString();

  return (
    <>
      <PageHeader title="Audit log" description="Every view, change, status update, score and email, with who and when. Entries can't be edited or deleted." />
      <Form action="/admin/audit" className="mb-5 grid gap-3 rounded-[10px] border border-line bg-white p-4 sm:grid-cols-[2fr_1fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Search action, detail or person" aria-label="Search" />
        <Select name="entity" defaultValue={entity} aria-label="Record type">
          <option value="">All records</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {e[0].toUpperCase() + e.slice(1)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </Form>
      <Table>
        <THead>
          <tr>
            <TH>When</TH>
            <TH>Who</TH>
            <TH>Action</TH>
            <TH>Record</TH>
            <TH>Detail</TH>
          </tr>
        </THead>
        <tbody>
          {rows.map(({ a, name }) => (
            <TR key={a.id}>
              <TD className="whitespace-nowrap">{formatDateTime(a.createdAt)}</TD>
              <TD className="whitespace-nowrap">{name ?? "System"}</TD>
              <TD className="whitespace-nowrap">{a.action.replace(/_/g, " ")}</TD>
              <TD className="whitespace-nowrap">
                {a.entity}
                {a.entityId ? ` #${a.entityId}` : ""}
              </TD>
              <TD className="min-w-64 break-words">{a.detail}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <div className="mt-4 flex gap-2">
        {before ? (
          <ButtonLink href={`/admin/audit?${qs({})}`} variant="secondary" size="sm">
            Newest
          </ButtonLink>
        ) : null}
        {next && (
          <ButtonLink href={`/admin/audit?${qs({ before: String(next) })}`} variant="secondary" size="sm">
            Older entries
          </ButtonLink>
        )}
      </div>
    </>
  );
}
