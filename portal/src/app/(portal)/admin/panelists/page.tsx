import type { Metadata } from "next";
import { asc, eq, ne, and, count } from "drizzle-orm";
import { db } from "@/lib/db";
import { panelMembers, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";
import { appUrl } from "@/lib/email";
import { regenerateLinkAction } from "@/actions/panels";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PanelistForm } from "@/components/panels/panelist-form";
import { CopyLink } from "@/components/panels/copy-link";

export const metadata: Metadata = { title: "Panelists" };

export default async function PanelistsPage({ searchParams }: PageProps<"/admin/panelists">) {
  await requireUser(STAFF_ROLES);
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.toLowerCase() : "";
  const people = (await db.select().from(users).where(eq(users.role, "panel")).orderBy(asc(users.name)));
  const served = new Map(
    (await db
      .select({ userId: panelMembers.userId, n: count() })
      .from(panelMembers)
      .where(and(ne(panelMembers.inviteStatus, "replaced"), ne(panelMembers.inviteStatus, "declined")))
      .groupBy(panelMembers.userId)
      )
      .map((r) => [r.userId, r.n]),
  );
  const shown = people.filter((p) => !q || `${p.name} ${p.organisation} ${p.discipline} ${p.email}`.toLowerCase().includes(q));

  return (
    <>
      <PageHeader title="Panelists" description="Internal and external panel members. Pick from this directory when you build a panel." />
      <div className="grid gap-6">
        <Card>
          <CardHeader title="Add a panel member" />
          <CardBody>
            <PanelistForm />
          </CardBody>
        </Card>

        <form method="get" className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-64 flex-1 gap-1.5">
            <span className="text-[15px] font-medium">Search the directory</span>
            <input name="q" defaultValue={q} placeholder="Name, organisation or discipline" className="h-11 rounded-[4px] border border-line bg-white px-3 text-base focus:border-teal focus:outline-none" />
          </label>
        </form>

        {shown.length === 0 ? (
          <EmptyState title={people.length ? "Nobody matches that search" : "No panel members yet"} />
        ) : (
          <ul className="grid gap-3">
            {shown.map((p) => (
              <li key={p.id} className="rounded-[10px] border border-line bg-white">
                <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-lg font-semibold">{p.name}</p>
                    <p className="text-[15px] text-muted">{[p.designation, p.organisation].filter(Boolean).join(", ")}</p>
                    <p className="text-[15px]">{[p.email, p.phone].filter(Boolean).join(" · ")}</p>
                    {p.discipline && <p className="text-[15px] text-muted">Discipline: {p.discipline}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={p.external ? "sand" : "teal"}>{p.external ? "External" : "Internal"}</Badge>
                    <Badge>
                      {served.get(p.id) ?? 0} panel{(served.get(p.id) ?? 0) === 1 ? "" : "s"}
                    </Badge>
                  </div>
                </div>
                {p.accessToken && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-muted">Secure link (signs them in without a password)</p>
                      <CopyLink url={appUrl(`/x/${p.accessToken}`)} />
                    </div>
                    <ActionForm action={regenerateLinkAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmButton variant="secondary" question="Old link stops working." confirmText="Replace link">
                        Replace link
                      </ConfirmButton>
                    </ActionForm>
                  </div>
                )}
                <details className="border-t border-line px-5 py-3">
                  <summary className="cursor-pointer text-[15px] font-semibold text-teal">Edit details</summary>
                  <div className="pt-4">
                    <PanelistForm person={p} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
