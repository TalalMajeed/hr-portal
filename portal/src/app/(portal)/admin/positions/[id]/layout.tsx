import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, events, panels } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { STAFF_ROLES } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { TabNav } from "@/components/ui/tab-nav";
import { StageTracker } from "@/components/ui/stage-tracker";
import { ApprovalBadge } from "@/components/ui/status-badge";
import { Badge } from "@/components/ui/badge";

/** Header, stage tracker and section tabs shared by every page of a position. */
export default async function PositionLayout({ children, params }: LayoutProps<"/admin/positions/[id]">) {
  const user = await requireUser(STAFF_ROLES);
  const { id } = await params;
  const p = await positionForPage(user, id);
  const base = `/admin/positions/${p.id}`;
  const appCount = db.select({ n: count() }).from(applications).where(eq(applications.positionId, p.id)).get()?.n ?? 0;
  const panelCount = db.select({ n: count() }).from(panels).where(eq(panels.positionId, p.id)).get()?.n ?? 0;
  const eventCount = db.select({ n: count() }).from(events).where(eq(events.positionId, p.id)).get()?.n ?? 0;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Positions", href: "/admin/positions" }, { label: p.code }]}
        title={p.title}
        description={`${p.department} · ${p.type === "faculty" ? "Faculty" : "Administrative"} · ${p.grade} · ${p.posts} ${p.posts === 1 ? "post" : "posts"}`}
        meta={
          <>
            <ApprovalBadge status={p.approvalStatus} />
            {p.status !== "active" && <Badge tone={p.status === "filled" ? "success" : "neutral"}>{p.status === "on_hold" ? "On hold" : p.status[0].toUpperCase() + p.status.slice(1)}</Badge>}
            {p.shortlistApproved && <Badge tone="success">Shortlist approved</Badge>}
          </>
        }
      />
      <div className="mb-6 rounded-[10px] border border-line bg-white px-5 py-4">
        <StageTracker stage={p.stage} />
      </div>
      <TabNav
        tabs={[
          { href: base, label: "Overview", exact: true },
          { href: `${base}/setup`, label: "ToRs, JD and criteria" },
          { href: `${base}/advert`, label: "Advert" },
          { href: `${base}/applications`, label: "Applications", count: appCount },
          { href: `${base}/panels`, label: "Panels", count: panelCount },
          { href: `${base}/schedule`, label: "Schedule", count: eventCount },
          { href: `${base}/evaluations`, label: "Evaluations" },
          { href: `${base}/board`, label: "Selection Board" },
        ]}
      />
      {children}
    </>
  );
}
