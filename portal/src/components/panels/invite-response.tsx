import { respondInviteAction } from "@/actions/panels";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Field, Input } from "@/components/ui/field";

/** E4: accept, or decline with a reason. */
export function InviteResponse({ panelId }: { panelId: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ActionForm action={respondInviteAction}>
        <input type="hidden" name="panelId" value={panelId} />
        <input type="hidden" name="response" value="accept" />
        <SubmitButton className="w-full" pendingText="Accepting…">
          Accept invitation
        </SubmitButton>
      </ActionForm>
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center justify-center rounded-[2px] border border-teal px-5 text-[15px] font-semibold text-teal">Decline</summary>
        <ActionForm action={respondInviteAction} className="mt-3 grid gap-3">
          <input type="hidden" name="panelId" value={panelId} />
          <input type="hidden" name="response" value="decline" />
          <Field label="Reason" htmlFor={`dec-${panelId}`}>
            <Input id={`dec-${panelId}`} name="reason" required />
          </Field>
          <SubmitButton variant="danger" pendingText="Sending…">
            Decline invitation
          </SubmitButton>
        </ActionForm>
      </details>
    </div>
  );
}
