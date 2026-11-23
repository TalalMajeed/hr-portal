import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, gt } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { adverts, applications, positions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { formatDate, relativeDays } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Open positions" };

export default async function AgencyHome() {
  const user = await requireUser(["agency"]);
  const open = (await db
    .select({ p: positions, a: adverts })
    .from(adverts)
    .innerJoin(positions, eq(positions.id, adverts.positionId))
    .where(and(eq(adverts.status, "published"), gt(adverts.closingAt, new Date().toISOString())))
    .orderBy(asc(adverts.closingAt))
    );
  const mine = (await db.select({ positionId: applications.positionId }).from(applications).where(eq(applications.agencyId, user.id)));
  const countFor = (id: number) => mine.filter((m) => m.positionId === id).length;

  return (
    <>
      <PageHeader title="Open positions" description={`Upload candidates you have sourced for ${user.organisation || "your agency"}. Each one is tagged with your agency as the source.`} />
      {open.length === 0 ? (
        <EmptyState title="No positions are open right now">When DU publishes a position it appears here.</EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <TH>Position</TH>
              <TH>Category</TH>
              <TH>Closes</TH>
              <TH className="text-right">Your candidates</TH>
              <TH>
                <span className="sr-only">Open</span>
              </TH>
            </tr>
          </THead>
          <tbody>
            {open.map(({ p, a }) => (
              <TR key={p.id}>
                <TD className="min-w-56">
                  <Link href={`/agency/${p.id}`} className="font-semibold">
                    {p.title}
                  </Link>
                  <span className="block text-sm text-muted">
                    {p.code} · {p.department}
                  </span>
                </TD>
                <TD>
                  <Badge tone={p.type === "faculty" ? "teal" : "sand"}>{p.type === "faculty" ? "Faculty" : "Administrative"}</Badge>
                </TD>
                <TD className="whitespace-nowrap">
                  {formatDate(a.closingAt)}
                  <span className="block text-sm text-muted">{relativeDays(a.closingAt)}</span>
                </TD>
                <TD className="text-right tabular-nums">{countFor(p.id)}</TD>
                <TD className="text-right">
                  <Link href={`/agency/${p.id}`} className="inline-flex items-center gap-1 whitespace-nowrap font-semibold no-underline">
                    Add candidates <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
