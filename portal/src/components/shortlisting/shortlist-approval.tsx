import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvals, users } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { shortlistApprovalAction } from "@/actions/shortlisting";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";

/** D7: the shortlist goes to the ED before anyone is contacted. */
export async function ShortlistApproval({ positionId, shortCount, user }: { positionId: number; shortCount: number; user: SessionUser }) {
  const latest = (await db
    .select({ a: approvals, by: users.name })
    .from(approvals)
    .leftJoin(users, eq(users.id, approvals.userId))
    .where(and(eq(approvals.positionId, positionId), eq(approvals.subject, "shortlist")))
    .orderBy(desc(approvals.id))
    )[0];
  const state = latest?.a.action ?? "none";
  const isApprover = ["ed", "super_admin"].includes(user.role);
  const badge =
    state === "submitted" ? <Badge tone="warning">With the ED</Badge> : state === "ed_approved" ? <Badge tone="success">Approved</Badge> : state === "returned" ? <Badge tone="danger">Returned</Badge> : <Badge>Not sent</Badge>;

  return (
    <Card>
      <CardHeader title="Shortlist approval" description={`${shortCount} on the shortlist. The ED approves it before candidates are contacted.`} actions={badge} />
      <CardBody className="grid gap-4">
        {latest && (
          <p className="text-[15px] text-muted">
            Last update {formatDateTime(latest.a.createdAt)} by {latest.by ?? "system"}
            {latest.a.comment ? `: "${latest.a.comment}"` : ""}
          </p>
        )}
        {state === "submitted" && isApprover ? (
          <ActionForm action={shortlistApprovalAction} className="grid gap-3">
            <input type="hidden" name="positionId" value={positionId} />
            <Field label="Comment" htmlFor="sl-comment" hint="Needed when you return it">
              <Textarea id="sl-comment" name="comment" rows={2} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="approve" pendingText="Approving…">
                Approve shortlist
              </SubmitButton>
              <SubmitButton name="intent" value="return" variant="secondary" pendingText="Returning…">
                Return to HR
              </SubmitButton>
            </div>
          </ActionForm>
        ) : state === "submitted" ? (
          <Notice>Waiting for the Executive Director.</Notice>
        ) : (
          <ActionForm action={shortlistApprovalAction} className="grid gap-3">
            <input type="hidden" name="positionId" value={positionId} />
            <input type="hidden" name="intent" value="submit" />
            <Field label="Note for the ED" htmlFor="sl-note">
              <Textarea id="sl-note" name="comment" rows={2} />
            </Field>
            <div>
              <SubmitButton pendingText="Sending…" variant={state === "ed_approved" ? "secondary" : "primary"}>
                {state === "ed_approved" ? "Send the updated shortlist again" : "Send shortlist to ED"}
              </SubmitButton>
            </div>
          </ActionForm>
        )}
      </CardBody>
    </Card>
  );
}
