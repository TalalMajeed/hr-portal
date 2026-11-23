import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { visiblePositionIds } from "@/lib/access";
import { pendingApprovals, type PendingItem } from "@/lib/approvals";
import { STAFF_ROLES } from "@/lib/constants";
import { formatDateTime, relativeDays } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Approvals" };

function List({ rows }: { rows: PendingItem[] }) {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-[10px] border border-line bg-white">
      {rows.map((i) => (
        <li key={`${i.kind}-${i.positionId}-${i.detail}`}>
          <Link href={i.href} className="flex items-center gap-4 px-5 py-4 no-underline transition-colors duration-150 hover:bg-off">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={i.kind === "position" ? "teal" : i.kind === "advert" ? "sand" : "neutral"}>{i.detail}</Badge>
                <span className="text-sm text-muted">Waiting on {i.waitingOn}</span>
              </div>
              <p className="mt-1 truncate font-semibold text-ink">{i.title}</p>
              <p className="text-sm text-muted">
                {i.code} · since {formatDateTime(i.since)} ({relativeDays(i.since)})
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function ApprovalsPage() {
  const user = await requireUser(STAFF_ROLES);
  const visible = await visiblePositionIds(user);
  const items = (await pendingApprovals()).filter((i) => !visible || visible.includes(i.positionId));
  const mine = items.filter((i) => (i.waitingOn === "ED" ? ["ed", "super_admin"] : ["hr", "super_admin"]).includes(user.role));
  const others = items.filter((i) => !mine.includes(i));


  return (
    <>
      <PageHeader title="Approvals" description="Positions, ads, shortlists and panels waiting for a decision." />
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Waiting for you</h2>
        {mine.length ? <List rows={mine} /> : <EmptyState title="Nothing waiting for you">New requests appear here as soon as they are sent.</EmptyState>}
      </section>
      {others.length > 0 && (
        <section className="mt-8 grid gap-3">
          <h2 className="text-lg font-semibold">Waiting for others</h2>
          <List rows={others} />
        </section>
      )}
    </>
  );
}
