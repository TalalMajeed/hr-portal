import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, applications, documents, positions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { panelApplicationIds } from "@/lib/access";
import { documentKindLabel } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { DocumentList, ProfileView } from "@/components/applications/profile-view";

export const metadata: Metadata = { title: "Candidate file" };

/** Panel members see only candidates they are scheduled to meet and have no conflict with. */
export default async function PanelCandidatePage({ params }: PageProps<"/panel/candidates/[appId]">) {
  const user = await requireUser(["panel"]);
  const { appId } = await params;
  const id = Number(appId);
  if (!panelApplicationIds(user.id).includes(id)) notFound();
  const app = db.select().from(applications).where(eq(applications.id, id)).get();
  if (!app?.snapshot) notFound();
  const position = db.select().from(positions).where(eq(positions.id, app.positionId)).get()!;
  const advert = db.select().from(adverts).where(eq(adverts.positionId, position.id)).get();
  const supporting = db.select().from(documents).where(eq(documents.applicationId, app.id)).all();
  audit(user.id, "viewed", "application", app.id, "panel file");
  return (
    <>
      <PageHeader crumbs={[{ label: "My panels", href: "/panel" }, { label: app.snapshot.name }]} title={app.snapshot.name} description={`${position.title} · ${app.appNo}`} />
      <div className="grid gap-6">
        {supporting.length > 0 && (
          <Card>
            <CardHeader title="Supporting files from HR" />
            <CardBody>
              <DocumentList docs={supporting.map((d) => ({ ...d, label: d.label || documentKindLabel(d.kind) }))} />
            </CardBody>
          </Card>
        )}
        <ProfileView snapshot={app.snapshot} answers={app.answers} questions={advert?.questions ?? []} />
      </div>
    </>
  );
}
