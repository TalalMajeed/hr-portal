"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-state";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";

type Values = {
  id?: number;
  title: string;
  type: "faculty" | "administrative";
  department: string;
  category: string;
  posts: number;
  grade: string;
  reportingLine: string;
  budgetLine: string;
  justification: string;
  discipline: string;
  rank: string;
  researchArea: string;
  teachingAreas: string;
  hiringLeadId: number | null;
};

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  values?: Partial<Values>;
  departments: { name: string; kind: string }[];
  categories: string[];
  grades: string[];
  ranks: string[];
  leads: { id: number; name: string; designation: string }[];
  showLead: boolean;
  submitLabel: string;
  readOnly?: boolean;
};

/** A1 and A5: the position request. Faculty fields show only for faculty posts. */
export function PositionForm({ action, values = {}, departments, categories, grades, ranks, leads, showLead, submitLabel, readOnly }: Props) {
  const [state, formAction] = useActionState(action, null);
  const [type, setType] = useState<"faculty" | "administrative">(values.type ?? "faculty");
  const err = state?.fieldErrors ?? {};
  const depts = departments.filter((d) => (type === "faculty" ? d.kind === "faculty" : d.kind === "administrative"));
  return (
    <form action={formAction} className="grid gap-5">
      {state?.error && <Notice tone="error">{state.error}</Notice>}
      {state?.ok && state.message && <Notice tone="success">{state.message}</Notice>}
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <fieldset disabled={readOnly} className="grid gap-5">
        <FormGrid>
          <Field label="Position title" htmlFor="title" error={err.title} required className="sm:col-span-2">
            <Input id="title" name="title" defaultValue={values.title} placeholder="For example: Founding Faculty, Mathematics" required aria-invalid={!!err.title} />
          </Field>
          <Field label="Type" htmlFor="type" required>
            <Select id="type" name="type" value={type} onChange={(e) => setType(e.target.value as "faculty" | "administrative")}>
              <option value="faculty">Faculty</option>
              <option value="administrative">Administrative</option>
            </Select>
          </Field>
          <Field label={type === "faculty" ? "Department or discipline" : "Department"} htmlFor="department" error={err.department} required>
            <Input id="department" name="department" list="departments" defaultValue={values.department} required aria-invalid={!!err.department} />
            <datalist id="departments">
              {depts.map((d) => (
                <option key={d.name} value={d.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue={values.category ?? (type === "faculty" ? "Faculty" : "Manager")}>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Number of posts" htmlFor="posts" required>
            <Input id="posts" name="posts" type="number" inputMode="numeric" min={1} max={50} defaultValue={values.posts ?? 1} required />
          </Field>
          <Field label="Grade or pay band" htmlFor="grade" error={err.grade} required>
            <Input id="grade" name="grade" list="grades" defaultValue={values.grade} required aria-invalid={!!err.grade} />
            <datalist id="grades">
              {grades.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </Field>
          <Field label="Reporting line" htmlFor="reportingLine" hint="Who the post holder reports to">
            <Input id="reportingLine" name="reportingLine" defaultValue={values.reportingLine} />
          </Field>
          <Field label="Budget line" htmlFor="budgetLine">
            <Input id="budgetLine" name="budgetLine" defaultValue={values.budgetLine} placeholder="DU-ACAD-MATH-2026-01" />
          </Field>
          {showLead && (
            <Field label="Hiring lead" htmlFor="hiringLeadId">
              <Select id="hiringLeadId" name="hiringLeadId" defaultValue={values.hiringLeadId ?? ""}>
                <option value="">Not assigned</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.designation ? `, ${l.designation}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </FormGrid>

        {type === "faculty" && (
          <fieldset className="grid gap-5 rounded-[10px] border border-line bg-off p-4 sm:p-5">
            <legend className="px-1 text-[15px] font-semibold">Faculty details</legend>
            <FormGrid>
              <Field label="Discipline" htmlFor="discipline">
                <Input id="discipline" name="discipline" defaultValue={values.discipline} />
              </Field>
              <Field label="Rank" htmlFor="rank" error={err.rank} required>
                <Select id="rank" name="rank" defaultValue={values.rank || ""} aria-invalid={!!err.rank}>
                  <option value="" disabled>
                    Choose a rank
                  </option>
                  {ranks.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Research area" htmlFor="researchArea">
                <Input id="researchArea" name="researchArea" defaultValue={values.researchArea} />
              </Field>
              <Field label="Teaching areas" htmlFor="teachingAreas">
                <Input id="teachingAreas" name="teachingAreas" defaultValue={values.teachingAreas} />
              </Field>
            </FormGrid>
          </fieldset>
        )}

        <Field label="Justification" htmlFor="justification" error={err.justification} hint="Why the post is needed now" required>
          <Textarea id="justification" name="justification" defaultValue={values.justification} rows={3} required aria-invalid={!!err.justification} />
        </Field>
      </fieldset>
      {!readOnly && (
        <div>
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
      )}
    </form>
  );
}
