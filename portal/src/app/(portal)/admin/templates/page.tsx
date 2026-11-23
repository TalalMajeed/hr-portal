import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailTemplates, jdTemplates } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { DOCUMENT_KINDS } from "@/lib/constants";
import { formatShortDate } from "@/lib/format";
import { deleteJdTemplateAction, saveEmailTemplateAction, saveJdTemplateAction } from "@/actions/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Templates" };

function JdTemplateForm({ t }: { t?: typeof jdTemplates.$inferSelect }) {
  const c = t?.content;
  return (
    <ActionForm action={saveJdTemplateAction} className="grid gap-4" resetOnSuccess={!t}>
      {t && <input type="hidden" name="templateId" value={t.id} />}
      <FormGrid>
        <Field label="Template name" htmlFor={`n-${t?.id ?? "new"}`}>
          <Input id={`n-${t?.id ?? "new"}`} name="name" defaultValue={t?.name} required />
        </Field>
        <Field label="Type" htmlFor={`t-${t?.id ?? "new"}`}>
          <Select id={`t-${t?.id ?? "new"}`} name="type" defaultValue={t?.type ?? "faculty"}>
            <option value="faculty">Faculty</option>
            <option value="administrative">Administrative</option>
          </Select>
        </Field>
      </FormGrid>
      <Field label="Summary" htmlFor={`s-${t?.id ?? "new"}`}>
        <Textarea id={`s-${t?.id ?? "new"}`} name="summary" rows={2} defaultValue={c?.summary} />
      </Field>
      <FormGrid>
        <Field label="Duties" hint="One per line" htmlFor={`d-${t?.id ?? "new"}`}>
          <Textarea id={`d-${t?.id ?? "new"}`} name="duties" rows={5} defaultValue={c?.duties.join("\n")} />
        </Field>
        <Field label="Skills" hint="One per line" htmlFor={`k-${t?.id ?? "new"}`}>
          <Textarea id={`k-${t?.id ?? "new"}`} name="skills" rows={5} defaultValue={c?.skills.join("\n")} />
        </Field>
        <Field label="Required qualifications" hint="One per line" htmlFor={`r-${t?.id ?? "new"}`}>
          <Textarea id={`r-${t?.id ?? "new"}`} name="requiredQualifications" rows={3} defaultValue={c?.requiredQualifications.join("\n")} />
        </Field>
        <Field label="Preferred qualifications" hint="One per line" htmlFor={`p-${t?.id ?? "new"}`}>
          <Textarea id={`p-${t?.id ?? "new"}`} name="preferredQualifications" rows={3} defaultValue={c?.preferredQualifications.join("\n")} />
        </Field>
      </FormGrid>
      <Field label="Experience" htmlFor={`e-${t?.id ?? "new"}`}>
        <Input id={`e-${t?.id ?? "new"}`} name="experience" defaultValue={c?.experience} />
      </Field>
      <fieldset>
        <legend className="text-[15px] font-medium">Documents to upload</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {DOCUMENT_KINDS.filter((d) => d.value !== "other").map((d) => (
            <Checkbox key={d.value} name="requiredDocuments" value={d.value} label={d.label} defaultChecked={c?.requiredDocuments.includes(d.value)} />
          ))}
        </div>
      </fieldset>
      <div>
        <SubmitButton>{t ? "Save template" : "Add template"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export default async function TemplatesPage() {
  await requireUser(["super_admin", "hr"]);
  const emails = (await db.select().from(emailTemplates).orderBy(asc(emailTemplates.name)));
  const jds = (await db.select().from(jdTemplates).orderBy(asc(jdTemplates.name)));
  return (
    <>
      <PageHeader title="Templates" description="The automatic emails candidates and panel members receive, and the job description templates." />
      <section className="grid gap-3">
        <h2 className="text-lg font-semibold">Email templates</h2>
        <p className="text-[15px] text-muted">
          Words in double braces, such as {"{{name}}"} or {"{{position}}"}, are filled in when the email is sent. Keep them as they are.
        </p>
        <ul className="grid gap-3">
          {emails.map((t) => (
            <li key={t.key}>
              <details className="rounded-[10px] border border-line bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
                  <span className="font-semibold">{t.name}</span>
                  <span className="text-sm text-muted">Edited {formatShortDate(t.updatedAt)}</span>
                </summary>
                <div className="border-t border-line px-5 py-5">
                  <ActionForm action={saveEmailTemplateAction} className="grid gap-4">
                    <input type="hidden" name="key" value={t.key} />
                    <Field label="Subject" htmlFor={`sub-${t.key}`}>
                      <Input id={`sub-${t.key}`} name="subject" defaultValue={t.subject} />
                    </Field>
                    <Field label="Body" htmlFor={`body-${t.key}`}>
                      <Textarea id={`body-${t.key}`} name="body" rows={9} defaultValue={t.body} />
                    </Field>
                    <p className="text-sm text-muted">
                      Placeholders used: {[...new Set(`${t.subject} ${t.body}`.match(/\{\{\s*\w+\s*\}\}/g) ?? [])].join(", ") || "none"}
                    </p>
                    <div>
                      <SubmitButton>Save template</SubmitButton>
                    </div>
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 grid gap-3">
        <h2 className="text-lg font-semibold">Job description templates</h2>
        <ul className="grid gap-3">
          {jds.map((t) => (
            <li key={t.id}>
              <details className="rounded-[10px] border border-line bg-white">
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-5 py-4">
                  <span className="font-semibold">{t.name}</span>
                  <Badge tone={t.type === "faculty" ? "teal" : "sand"}>{t.type === "faculty" ? "Faculty" : "Administrative"}</Badge>
                </summary>
                <div className="grid gap-4 border-t border-line px-5 py-5">
                  <JdTemplateForm t={t} />
                  <ActionForm action={deleteJdTemplateAction}>
                    <input type="hidden" name="templateId" value={t.id} />
                    <ConfirmButton question="Delete this template?" confirmText="Delete">
                      Delete template
                    </ConfirmButton>
                  </ActionForm>
                </div>
              </details>
            </li>
          ))}
        </ul>
        <Card>
          <CardHeader title="New JD template" />
          <CardBody>
            <JdTemplateForm />
          </CardBody>
        </Card>
      </section>
    </>
  );
}
