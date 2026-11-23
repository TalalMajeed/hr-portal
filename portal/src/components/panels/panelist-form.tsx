import type { users } from "@/lib/db/schema";
import { savePanelistAction } from "@/actions/panels";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { Checkbox, Field, FormGrid, Input } from "@/components/ui/field";

/** Add or edit a panel member in the directory (E1). */
export function PanelistForm({ person }: { person?: typeof users.$inferSelect }) {
  const p = person;
  const key = p ? `pm-${p.id}` : "pm-new";
  return (
    <ActionForm action={savePanelistAction} className="grid gap-4" resetOnSuccess={!p}>
      {p && <input type="hidden" name="id" value={p.id} />}
      <FormGrid>
        <Field label="Name" htmlFor={`${key}-name`} required>
          <Input id={`${key}-name`} name="name" defaultValue={p?.name} required />
        </Field>
        <Field label="Email" htmlFor={`${key}-email`} required>
          <Input id={`${key}-email`} name="email" type="email" defaultValue={p?.email} required />
        </Field>
        <Field label="Designation" htmlFor={`${key}-designation`}>
          <Input id={`${key}-designation`} name="designation" defaultValue={p?.designation} />
        </Field>
        <Field label="Organisation" htmlFor={`${key}-org`}>
          <Input id={`${key}-org`} name="organisation" defaultValue={p?.organisation} />
        </Field>
        <Field label="Phone" htmlFor={`${key}-phone`}>
          <Input id={`${key}-phone`} name="phone" type="tel" defaultValue={p?.phone} />
        </Field>
        <Field label="Discipline" htmlFor={`${key}-discipline`}>
          <Input id={`${key}-discipline`} name="discipline" defaultValue={p?.discipline} />
        </Field>
      </FormGrid>
      <Checkbox name="external" defaultChecked={p?.external ?? false} label="External panelist" hint="From outside DU. Works through a secure link." />
      <div>
        <SubmitButton>{p ? "Save changes" : "Add to directory"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
