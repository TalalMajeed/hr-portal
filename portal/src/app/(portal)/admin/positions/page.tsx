import type { Metadata } from "next";
import Link from "next/link";
import Form from "next/form";
import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { adverts, applications, positions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { visiblePositionIds } from "@/lib/access";
import { closeExpiredAdverts } from "@/lib/adverts";
import { STAFF_ROLES, STAGES } from "@/lib/constants";
import { formatShortDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink, Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Input, Select } from "@/components/ui/field";
import { ApprovalBadge, AdvertBadge } from "@/components/ui/status-badge";
import { StageLabel } from "@/components/ui/stage-tracker";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Positions" };

export default async function PositionsPage({ searchParams }: PageProps<"/admin/positions">) {
  const user = await requireUser(STAFF_ROLES);
  closeExpiredAdverts();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const type = typeof sp.type === "string" ? sp.type : "";
  const stage = typeof sp.stage === "string" ? sp.stage : "";
  const status = typeof sp.status === "string" ? sp.status : "open";

  const where: SQL[] = [];
  const visible = visiblePositionIds(user);
  if (visible) where.push(visible.length ? inArray(positions.id, visible) : sql`0`);
  if (q) where.push(or(like(positions.title, `%${q}%`), like(positions.code, `%${q}%`), like(positions.department, `%${q}%`))!);
  if (type === "faculty" || type === "administrative") where.push(eq(positions.type, type));
  if (stage) where.push(eq(positions.stage, Number(stage) as 1));
  if (status === "open") where.push(eq(positions.status, "active"));
  else if (status) where.push(eq(positions.status, status as "active"));

  const rows = db
    .select({
      p: positions,
      advertStatus: adverts.status,
      closingAt: adverts.closingAt,
      apps: sql<number>`(select count(*) from ${applications} where ${applications.positionId} = ${positions.id} and ${applications.status} != 'draft')`,
    })
    .from(positions)
    .leftJoin(adverts, eq(adverts.positionId, positions.id))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(positions.status), desc(positions.updatedAt))
    .all();

  const canCreate = ["super_admin", "hr", "hiring_lead"].includes(user.role);

  return (
    <>
      <PageHeader
        title="Positions"
        description="Every position and the stage it has reached."
        actions={
          canCreate && (
            <ButtonLink href="/admin/positions/new">
              <Plus aria-hidden /> New position
            </ButtonLink>
          )
        }
      />
      <Form action="/admin/positions" className="mb-5 grid gap-3 rounded-[10px] border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Input name="q" defaultValue={q} placeholder="Search title, code or department" aria-label="Search" />
        <Select name="type" defaultValue={type} aria-label="Type">
          <option value="">All types</option>
          <option value="faculty">Faculty</option>
          <option value="administrative">Administrative</option>
        </Select>
        <Select name="stage" defaultValue={stage} aria-label="Stage">
          <option value="">All stages</option>
          {STAGES.map((s) => (
            <option key={s.n} value={s.n}>
              {s.n}. {s.name}
            </option>
          ))}
        </Select>
        <Select name="status" defaultValue={status} aria-label="Status">
          <option value="open">Active</option>
          <option value="">All</option>
          <option value="on_hold">On hold</option>
          <option value="filled">Filled</option>
          <option value="withdrawn">Withdrawn</option>
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </Form>

      {rows.length === 0 ? (
        <EmptyState title={q || type || stage ? "No positions match these filters" : "No positions yet"} action={canCreate ? <ButtonLink href="/admin/positions/new">Create the first position</ButtonLink> : undefined}>
          {q || type || stage ? "Try clearing a filter." : "Hiring leads and HR create position requests here."}
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Position</TH>
              <TH>Stage</TH>
              <TH>Approval</TH>
              <TH>Advert</TH>
              <TH className="text-right">Applications</TH>
            </tr>
          </THead>
          <tbody>
            {rows.map(({ p, advertStatus, closingAt, apps }) => (
              <TR key={p.id}>
                <TD className="min-w-64">
                  <Link href={`/admin/positions/${p.id}`} className="font-semibold no-underline hover:underline">
                    {p.title}
                  </Link>
                  <p className="text-sm text-muted">
                    {p.code} · {p.department} · {p.type === "faculty" ? "Faculty" : "Administrative"}
                  </p>
                  {p.status !== "active" && <Badge className="mt-1">{p.status === "on_hold" ? "On hold" : p.status}</Badge>}
                </TD>
                <TD>
                  <StageLabel stage={p.stage} />
                </TD>
                <TD>
                  <ApprovalBadge status={p.approvalStatus} />
                </TD>
                <TD className="whitespace-nowrap">
                  {advertStatus ? (
                    <>
                      <AdvertBadge status={advertStatus} />
                      {closingAt && <p className="mt-1 text-sm text-muted">Closes {formatShortDate(closingAt)}</p>}
                    </>
                  ) : (
                    <span className="text-muted">None</span>
                  )}
                </TD>
                <TD className="text-right tabular-nums">{apps}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
