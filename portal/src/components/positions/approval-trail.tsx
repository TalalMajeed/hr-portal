import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvals, users } from "@/lib/db/schema";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/constants";

const ACTIONS: Record<string, { label: string; tone: Tone }> = {
  submitted: { label: "Submitted", tone: "teal" },
  hr_reviewed: { label: "HR reviewed", tone: "teal" },
  ed_approved: { label: "ED approved", tone: "success" },
  returned: { label: "Returned", tone: "danger" },
};

/** A2: every approval step, time-stamped, with its comment. */
export async function ApprovalTrail({ positionId, subject }: { positionId: number; subject: "position" | "advert" | "shortlist" | "panel" }) {
  const rows = (await db
    .select({ a: approvals, name: users.name, role: users.role })
    .from(approvals)
    .leftJoin(users, eq(users.id, approvals.userId))
    .where(and(eq(approvals.positionId, positionId), eq(approvals.subject, subject)))
    .orderBy(asc(approvals.createdAt), asc(approvals.id))
    );
  if (!rows.length) return <p className="text-muted">No steps yet.</p>;
  return (
    <ol className="grid gap-4 border-l-2 border-line pl-4">
      {rows.map(({ a, name }) => {
        const s = ACTIONS[a.action] ?? { label: a.action, tone: "neutral" as Tone };
        return (
          <li key={a.id} className="relative">
            <span className="absolute top-2 -left-[23px] size-3 rounded-full border-2 border-white bg-teal" aria-hidden />
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={s.tone}>{s.label}</Badge>
              <span className="text-[15px] font-semibold">{name ?? "System"}</span>
              <span className="text-sm text-muted">{formatDateTime(a.createdAt)}</span>
            </div>
            {a.comment && <p className="mt-1 text-[15px]">{a.comment}</p>}
          </li>
        );
      })}
    </ol>
  );
}
