import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { panels } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { PANEL_ROUNDS, ROUND_LABELS, STAFF_ROLES } from "@/lib/constants";
import { createPanelAction } from "@/actions/panels";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { PanelCard } from "@/components/panels/panel-card";

export const metadata: Metadata = { title: "Panels" };

export default async function PanelsPage({ params }: PageProps<"/admin/positions/[id]/panels">) {
  const user = await requireUser(STAFF_ROLES);
  const { id } = await params;
  const position = await positionForPage(user, id);
  const list = db.select().from(panels).where(eq(panels.positionId, position.id)).orderBy(asc(panels.id)).all();
  const missing = PANEL_ROUNDS.filter((r) => !list.some((p) => p.round === r) && (position.type === "faculty" || r !== "talk"));

  return (
    <div className="grid gap-6">
      {!position.shortlistApproved && (
        <Notice tone="warning" title="The shortlist isn't approved yet">
          You can build the panel now, but candidates should only be scheduled after the ED approves the shortlist.
        </Notice>
      )}
      {list.map((p) => (
        <PanelCard key={p.id} panel={p} user={user} />
      ))}
      {missing.length > 0 && (
        <Card>
          <CardHeader title="Form a panel" description="One panel per round. A faculty talk or second round can have its own panel." />
          <CardBody>
            <ActionForm action={createPanelAction} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="positionId" value={position.id} />
              <Field label="Round" htmlFor="round" className="min-w-48">
                <Select id="round" name="round">
                  {missing.map((r) => (
                    <option key={r} value={r}>
                      {ROUND_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Name (optional)" htmlFor="pname" className="min-w-56 flex-1">
                <Input id="pname" name="name" placeholder="For example: Computer Science interview panel" />
              </Field>
              <SubmitButton>Create panel</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
