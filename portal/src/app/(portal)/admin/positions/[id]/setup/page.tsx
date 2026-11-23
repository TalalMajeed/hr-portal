import type { Metadata } from "next";
import { db } from "@/lib/db";
import { jdTemplates, users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { DEGREE_LEVELS, DOCUMENT_KINDS, STAFF_ROLES } from "@/lib/constants";
import { docHistory, EMPTY_JD, EMPTY_RUBRIC, getDoc } from "@/lib/positions";
import { formatDateTime } from "@/lib/format";
import { restoreVersionAction, saveCriteriaAction, saveJdAction, saveRubricAction, saveTorsAction } from "@/actions/positions";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";
import { CriteriaEditor } from "@/components/positions/criteria-editor";
import { RubricEditor } from "@/components/positions/rubric-editor";
import { DocPreview, DOC_LABELS } from "@/components/positions/doc-preview";

export const metadata: Metadata = { title: "ToRs, JD and criteria" };

function NoteField() {
  return (
    <Field label="What changed" htmlFor="note" hint="Saved with the version history">
      <Input name="note" placeholder="Optional" />
    </Field>
  );
}

export default async function SetupPage({ params }: PageProps<"/admin/positions/[id]/setup">) {
  const user = await requireUser(STAFF_ROLES);
  const p = await positionForPage(user, (await params).id);
  const torP = await getDoc(p.id, "tor_position");
  const torC = await getDoc(p.id, "tor_committee");
  const jd = await getDoc(p.id, "jd") ?? { ...EMPTY_JD, _version: 0 };
  const criteria = await getDoc(p.id, "criteria");
  const rubric = await getDoc(p.id, "rubric");
  const templates = (await db.select().from(jdTemplates));
  const history = await docHistory(p.id);
  const names = new Map((await db.select({ id: users.id, name: users.name }).from(users)).map((u) => [u.id, u.name]));
  const { _version: _rv, ...rubricContent } = rubric ?? { ...EMPTY_RUBRIC, _version: 0 };
  void _rv;
  const locked = user.role === "board";

  const sections = [
    ["tors", "ToRs"],
    ["jd", "Job description"],
    ["criteria", "Eligibility"],
    ["rubric", "Rubric"],
    ["history", "Version history"],
  ];

  return (
    <div className="grid gap-6">
      <nav aria-label="On this page" className="flex flex-wrap gap-2">
        {sections.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border border-line bg-white px-3 py-1.5 text-[15px] font-semibold text-ink no-underline hover:border-teal hover:text-teal">
            {label}
          </a>
        ))}
      </nav>

      <Card>
        <div id="tors" className="scroll-mt-24" />
        <CardHeader title="Terms of Reference" description="For the position and for its interview committee (A3)." actions={<Badge>v{Math.max(torP?._version ?? 0, torC?._version ?? 0)}</Badge>} />
        <CardBody>
          <ActionForm action={saveTorsAction} className="grid gap-5">
            <input type="hidden" name="id" value={p.id} />
            <fieldset disabled={locked} className="grid gap-5">
              <Field label="Position ToRs" htmlFor="tor_position">
                <Textarea id="tor_position" name="tor_position" rows={5} defaultValue={torP?.body} />
              </Field>
              <Field label="Interview committee ToRs" htmlFor="tor_committee">
                <Textarea id="tor_committee" name="tor_committee" rows={5} defaultValue={torC?.body} />
              </Field>
              <NoteField />
            </fieldset>
            <div>
              <SubmitButton>Save ToRs</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <div id="jd" className="scroll-mt-24" />
        <CardHeader title="Job description" description="Duties, qualifications, experience, skills and the documents applicants must upload (A4)." actions={<Badge>v{jd._version}</Badge>} />
        <CardBody className="grid gap-6">
          <ActionForm action={saveJdAction} className="flex flex-wrap items-end gap-3 rounded-[10px] border border-line bg-off p-4">
            <input type="hidden" name="id" value={p.id} />
            <Field label="Start again from a template" htmlFor="templateId" className="min-w-60 flex-1">
              <Select id="templateId" name="templateId" defaultValue="">
                <option value="" disabled>
                  Choose a template
                </option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <SubmitButton variant="secondary" pendingText="Applying…">
              Use template
            </SubmitButton>
          </ActionForm>

          <ActionForm action={saveJdAction} className="grid gap-5">
            <input type="hidden" name="id" value={p.id} />
            <Field label="Summary" htmlFor="summary">
              <Textarea id="summary" name="summary" rows={3} defaultValue={jd.summary} />
            </Field>
            <FormGrid>
              <Field label="Duties" htmlFor="duties" hint="One per line">
                <Textarea id="duties" name="duties" rows={6} defaultValue={jd.duties.join("\n")} />
              </Field>
              <Field label="Skills" htmlFor="skills" hint="One per line">
                <Textarea id="skills" name="skills" rows={6} defaultValue={jd.skills.join("\n")} />
              </Field>
              <Field label="Required qualifications" htmlFor="requiredQualifications" hint="One per line">
                <Textarea id="requiredQualifications" name="requiredQualifications" rows={4} defaultValue={jd.requiredQualifications.join("\n")} />
              </Field>
              <Field label="Preferred qualifications" htmlFor="preferredQualifications" hint="One per line">
                <Textarea id="preferredQualifications" name="preferredQualifications" rows={4} defaultValue={jd.preferredQualifications.join("\n")} />
              </Field>
            </FormGrid>
            <Field label="Experience" htmlFor="experience">
              <Textarea id="experience" name="experience" rows={2} defaultValue={jd.experience} />
            </Field>
            <fieldset>
              <legend className="text-[15px] font-medium">Documents applicants must upload</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {DOCUMENT_KINDS.filter((d) => d.value !== "other").map((d) => (
                  <Checkbox key={d.value} name="requiredDocuments" value={d.value} label={d.label} defaultChecked={jd.requiredDocuments.includes(d.value)} />
                ))}
              </div>
            </fieldset>
            <NoteField />
            <div>
              <SubmitButton>Save job description</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <div id="criteria" className="scroll-mt-24" />
        <CardHeader
          title="Eligibility criteria"
          description="Checked automatically when a candidate submits (A6, C6). Only mandatory criteria decide eligibility."
          actions={<Badge>v{criteria?._version ?? 0}</Badge>}
        />
        <CardBody>
          <ActionForm action={saveCriteriaAction} className="grid gap-5">
            <input type="hidden" name="id" value={p.id} />
            <CriteriaEditor initial={criteria?.items ?? []} degreeLevels={DEGREE_LEVELS} documentKinds={DOCUMENT_KINDS} />
            <FormGrid>
              <Field label="When a candidate doesn't meet a mandatory criterion" htmlFor="eligibilityMode">
                <Select id="eligibilityMode" name="eligibilityMode" defaultValue={p.eligibilityMode}>
                  <option value="flag">Let the application through, flagged</option>
                  <option value="block">Block the application</option>
                </Select>
              </Field>
              <NoteField />
            </FormGrid>
            <div>
              <SubmitButton>Save criteria</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <div id="rubric" className="scroll-mt-24" />
        <CardHeader
          title="Evaluation rubric"
          description="Defined now so the same rubric follows the position to shortlisting, interviews, talks and second rounds (A7)."
          actions={<Badge>v{rubric?._version ?? 0}</Badge>}
        />
        <CardBody>
          <ActionForm action={saveRubricAction} className="grid gap-5">
            <input type="hidden" name="id" value={p.id} />
            <RubricEditor initial={rubricContent} />
            <NoteField />
            <div>
              <SubmitButton>Save rubric</SubmitButton>
            </div>
          </ActionForm>
        </CardBody>
      </Card>

      <Card>
        <div id="history" className="scroll-mt-24" />
        <CardHeader title="Version history" description="Every saved version of the ToRs, JD, criteria and rubric (A8). Restoring keeps the history." />
        <CardBody className="p-0 sm:p-0">
          <ul className="divide-y divide-line">
            {history.map((h) => (
              <li key={h.id} className="px-5 py-3 sm:px-6">
                <details>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold">
                      {DOC_LABELS[h.kind]} v{h.version}
                    </span>
                    <span className="text-[15px] text-muted">
                      {formatDateTime(h.createdAt)}
                      {h.createdBy ? ` · ${names.get(h.createdBy)}` : ""}
                    </span>
                    {h.note && <span className="text-[15px]">{h.note}</span>}
                  </summary>
                  <div className="mt-3 rounded-[4px] border border-line bg-off p-4">
                    <DocPreview kind={h.kind} content={h.content} />
                    <ActionForm action={restoreVersionAction} className="mt-4">
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="docId" value={h.id} />
                      <SubmitButton variant="secondary" size="sm" pendingText="Restoring…">
                        Restore this version
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
