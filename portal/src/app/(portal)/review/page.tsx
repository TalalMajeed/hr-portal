import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import { applications, positions, reviewAssignments, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { formatShortDate } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "My reviews" };

export default async function ReviewListPage() {
  const user = await requireUser(["reviewer"]);
  const rows = (await db
    .select({ ra: reviewAssignments, app: applications, position: positions, candidate: users })
    .from(reviewAssignments)
    .innerJoin(applications, eq(applications.id, reviewAssignments.applicationId))
    .innerJoin(positions, eq(positions.id, applications.positionId))
    .innerJoin(users, eq(users.id, applications.candidateId))
    .where(eq(reviewAssignments.reviewerId, user.id))
    .orderBy(asc(positions.title), asc(reviewAssignments.id))
    );
  const byPosition = new Map<number, { title: string; code: string; rows: typeof rows }>();
  for (const r of rows) {
    const g = byPosition.get(r.position.id) ?? { title: r.position.title, code: r.position.code, rows: [] };
    g.rows.push(r);
    byPosition.set(r.position.id, g);
  }
  const open = rows.filter((r) => !r.ra.submittedAt).length;

  return (
    <>
      <PageHeader title="My reviews" description={rows.length ? `${open} of ${rows.length} still to score. Score each application against the rubric and add your remarks.` : undefined} />
      {rows.length === 0 ? (
        <EmptyState title="Nothing to review yet">DU HR will email you when applications are assigned to you.</EmptyState>
      ) : (
        <div className="grid gap-6">
          {[...byPosition.entries()].map(([pid, g]) => (
            <section key={pid}>
              <h2 className="mb-3 text-lg font-semibold">
                {g.title} <span className="font-normal text-muted">({g.code})</span>
              </h2>
              <ul className="grid gap-2">
                {g.rows.map((r) => (
                  <li key={r.ra.id}>
                    <Link
                      href={`/review/${r.ra.id}`}
                      className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-white px-4 py-3 text-ink no-underline transition-colors duration-150 hover:border-teal"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{r.candidate.name}</span>
                        <span className="block text-sm text-muted">
                          {r.app.appNo} · submitted {formatShortDate(r.app.submittedAt)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge tone={r.ra.submittedAt ? "success" : "warning"}>{r.ra.submittedAt ? "Submitted" : "To score"}</Badge>
                        <ChevronRight className="size-5 text-muted" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
