import type { Metadata } from "next";
import { desc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { boards, positions } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { LinkCard } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Board packs" };

export default async function BoardHome() {
  const rows = (await db
    .select({ p: positions, b: boards })
    .from(boards)
    .innerJoin(positions, eq(positions.id, boards.positionId))
    .where(isNotNull(boards.packGeneratedAt))
    .orderBy(desc(boards.packGeneratedAt))
    )
    .filter((r) => r.p.stage === 10);
  return (
    <>
      <PageHeader title="Selection Board packs" description="Read-only packs with the panel's recommendations. Contact HR to change anything." />
      {rows.length === 0 ? (
        <EmptyState title="No packs yet">HR will email you when a pack is ready.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map(({ p, b }) => (
            <li key={p.id}>
              <LinkCard href={`/board/${p.id}`} className="h-full">
                <div className="flex flex-wrap gap-2">
                  <Badge tone={p.type === "faculty" ? "teal" : "sand"}>{p.type === "faculty" ? "Faculty" : "Administrative"}</Badge>
                  {b.edSignedOffAt && <Badge tone="success">Signed off</Badge>}
                </div>
                <p className="mt-3 text-lg font-semibold">{p.title}</p>
                <p className="text-[15px] text-muted">
                  {p.code} · {p.department}
                </p>
                <p className="mt-2 text-[15px] text-muted">{b.meetingDate ? `Meeting ${formatDate(b.meetingDate)}` : `Pack ready ${formatDate(b.packGeneratedAt)}`}</p>
              </LinkCard>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
