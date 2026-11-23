import type { Metadata } from "next";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, positionEvents, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { CATEGORIES, DEPARTMENTS, FACULTY_RANKS, GRADES, STAFF_ROLES, stageName } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { approvalStepAction, setPositionStatusAction, updatePositionAction } from "@/actions/positions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/notice";
import { PositionForm } from "@/components/positions/position-form";
import { ApprovalTrail } from "@/components/positions/approval-trail";

export const metadata: Metadata = { title: "Position" };

const EVENT_LABELS: Record<string, string> = {
  stage_changed: "Stage changed",
  extended: "Closing date extended",
  readvertised: "Re-advertised",
  withdrawn: "Withdrawn",
};

export default async function PositionOverview({ params }: PageProps<"/admin/positions/[id]">) {
  const user = await requireUser(STAFF_ROLES);
  const p = await positionForPage(user, (await params).id);
  const leads = db.select({ id: users.id, name: users.name, designation: users.designation }).from(users).where(eq(users.role, "hiring_lead")).all();
  const history = db.select({ e: positionEvents, name: users.name }).from(positionEvents).leftJoin(users, eq(users.id, positionEvents.userId)).where(eq(positionEvents.positionId, p.id)).orderBy(desc(positionEvents.createdAt)).all();
  const counts = db
    .select({ status: applications.status, n: sql<number>`count(*)` })
    .from(applications)
    .where(eq(applications.positionId, p.id))
    .groupBy(applications.status)
    .all();
  const total = counts.filter((c) => c.status !== "draft").reduce((s, c) => s + c.n, 0);

  const isHr = ["hr", "super_admin"].includes(user.role);
  const isEd = ["ed", "super_admin"].includes(user.role);
  const editable = ["draft", "returned"].includes(p.approvalStatus) || isHr;

  const steps: { step: string; label: string; variant?: "primary" | "secondary" | "danger" }[] = [];
  if (["draft", "returned"].includes(p.approvalStatus)) steps.push({ step: "submit", label: "Send to HR for review" });
  if (p.approvalStatus === "hr_review" && isHr) steps.push({ step: "hr_approve", label: "Reviewed, send to ED" }, { step: "return", label: "Return to hiring lead", variant: "danger" });
  if (p.approvalStatus === "ed_review" && isEd) steps.push({ step: "ed_approve", label: "Approve position" }, { step: "return", label: "Return with comments", variant: "danger" });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="grid min-w-0 gap-6">
        <Card>
          <CardHeader title="Approval" description="Hiring lead drafts, HR reviews, the ED approves." />
          <CardBody className="grid gap-5">
            {p.approvalStatus === "approved" && <Notice tone="success">Approved. The position can now be advertised from the Advert tab.</Notice>}
            {p.approvalStatus === "returned" && <Notice tone="warning">Returned for changes. Update the details or documents, then send it again.</Notice>}
            <ApprovalTrail positionId={p.id} subject="position" />
            {steps.length > 0 && (
              <ActionForm action={approvalStepAction} className="grid gap-3 border-t border-line pt-5">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Comment" htmlFor="comment" hint="Required when returning">
                  <Textarea id="comment" name="comment" rows={2} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  {steps.map((s) => (
                    <SubmitButton key={s.step} name="step" value={s.step} variant={s.variant ?? "primary"} pendingText="Saving…">
                      {s.label}
                    </SubmitButton>
                  ))}
                </div>
              </ActionForm>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Position details" description={editable ? undefined : "Locked while it is with HR or the ED."} />
          <CardBody>
            <PositionForm
              action={updatePositionAction}
              values={p}
              departments={[...DEPARTMENTS]}
              categories={CATEGORIES}
              grades={GRADES}
              ranks={FACULTY_RANKS}
              leads={leads}
              showLead={user.role !== "hiring_lead"}
              submitLabel="Save details"
              readOnly={!editable}
            />
          </CardBody>
        </Card>
      </div>

      <div className="grid content-start gap-6">
        <Card>
          <CardHeader title="Applications" />
          <CardBody>
            <p className="font-serif text-[32px] font-semibold leading-none tabular-nums">{total}</p>
            <p className="mt-1 text-[15px] text-muted">submitted so far</p>
            {counts.length > 0 && (
              <ul className="mt-4 grid gap-1 text-[15px]">
                {counts
                  .filter((c) => c.status !== "draft")
                  .map((c) => (
                    <li key={c.status} className="flex justify-between">
                      <span className="capitalize">{c.status.replace(/_/g, " ")}</span>
                      <span className="tabular-nums">{c.n}</span>
                    </li>
                  ))}
              </ul>
            )}
          </CardBody>
        </Card>

        {isHr || isEd ? (
          <Card>
            <CardHeader title="Position status" />
            <CardBody>
              <ActionForm action={setPositionStatusAction} className="grid gap-3">
                <input type="hidden" name="id" value={p.id} />
                <Field label="Status" htmlFor="status">
                  <Select id="status" name="status" defaultValue={p.status}>
                    <option value="active">Active</option>
                    <option value="on_hold">On hold</option>
                    <option value="filled">Filled</option>
                    <option value="withdrawn">Withdrawn</option>
                  </Select>
                </Field>
                <Field label="Reason" htmlFor="reason">
                  <Input id="reason" name="reason" />
                </Field>
                <div>
                  <SubmitButton variant="secondary" size="sm">
                    Update status
                  </SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader title="History" />
          <CardBody>
            {history.length === 0 ? (
              <p className="text-muted">Nothing yet.</p>
            ) : (
              <ol className="grid gap-3">
                {history.map(({ e, name }) => (
                  <li key={e.id} className="text-[15px]">
                    <p className="font-semibold">
                      {e.type === "stage_changed" && e.toStage ? `Moved to ${e.toStage}. ${stageName(e.toStage)}` : (EVENT_LABELS[e.type] ?? e.type)}
                    </p>
                    {e.reason && <p>{e.reason}</p>}
                    <p className="text-sm text-muted">
                      {formatDateTime(e.createdAt)}
                      {name ? ` · ${name}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
