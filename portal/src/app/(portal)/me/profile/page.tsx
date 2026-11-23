import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getProfile, profileDocuments } from "@/lib/candidate";
import { DOCUMENT_KINDS, GENDERS, PROVINCES, TIMEZONES } from "@/lib/constants";
import { formatBytes, formatShortDate } from "@/lib/format";
import { ACCEPT_ATTR, maxUploadBytes } from "@/lib/uploads";
import { deleteProfileDocumentAction, saveSectionAction, savePersonalAction, uploadProfileDocumentAction } from "@/actions/candidate";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { DocumentList } from "@/components/applications/profile-view";
import { PersonalForm } from "@/components/candidate/personal-form";
import { EducationEditor, ExperienceEditor, PublicationEditor, ReferenceEditor } from "@/components/candidate/profile-sections";

export const metadata: Metadata = { title: "My profile" };

export default async function ProfilePage() {
  const user = await requireUser(["candidate"]);
  const p = getProfile(user.id);
  const docs = profileDocuments(user.id);
  const limitMb = maxUploadBytes() / 1024 / 1024;

  return (
    <>
      <PageHeader
        title="My profile"
        description="One profile for every application. You can keep editing it; each application keeps a copy of your profile as it was when you submitted."
      />
      <nav aria-label="Profile sections" className="mb-6 flex flex-wrap gap-x-4 gap-y-2 text-[15px]">
        {[
          ["#personal", "Personal details"],
          ["#education", "Qualifications"],
          ["#experience", "Experience"],
          ["#publications", "Publications"],
          ["#references", "References"],
          ["#documents", "Documents"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="font-semibold">
            {label}
          </a>
        ))}
      </nav>
      <div className="grid gap-6">
        <Card>
          <div id="personal" className="scroll-mt-24" />
          <CardHeader title="Personal details" />
          <CardBody>
            <PersonalForm
              action={savePersonalAction}
              genders={GENDERS}
              provinces={PROVINCES}
              timezones={TIMEZONES}
              values={{
                name: user.name,
                email: user.email,
                phone: user.phone,
                cnic: p.cnic,
                dateOfBirth: p.dateOfBirth,
                gender: p.gender,
                domicile: p.domicile,
                province: p.province,
                address: p.address,
                city: p.city,
                country: p.country,
                timezone: p.timezone,
                researchInterests: p.researchInterests,
              }}
            />
          </CardBody>
        </Card>

        <Card>
          <div id="education" className="scroll-mt-24" />
          <CardHeader title="Qualifications" description="Institution, degree, year and grade or CGPA." />
          <CardBody>
            <EducationEditor rows={p.education} action={saveSectionAction} />
          </CardBody>
        </Card>

        <Card>
          <div id="experience" className="scroll-mt-24" />
          <CardHeader title="Experience" description="Employer, designation, dates and duties." />
          <CardBody>
            <ExperienceEditor rows={p.experience} action={saveSectionAction} />
          </CardBody>
        </Card>

        <Card>
          <div id="publications" className="scroll-mt-24" />
          <CardHeader title="Research and publications" description="List every author in order and give your own position, so reviewers can see your contribution." />
          <CardBody>
            <PublicationEditor rows={p.publications} action={saveSectionAction} />
          </CardBody>
        </Card>

        <Card>
          <div id="references" className="scroll-mt-24" />
          <CardHeader title="References" />
          <CardBody>
            <ReferenceEditor rows={p.references} action={saveSectionAction} />
          </CardBody>
        </Card>

        <Card>
          <div id="documents" className="scroll-mt-24" />
          <CardHeader title="Documents" description={`PDF, JPG or PNG, up to ${limitMb} MB each. Every file is checked for malware.`} />
          <CardBody className="grid gap-6">
            {docs.length === 0 ? (
              <p className="text-muted">No documents yet. Most posts need your CV, degrees and CNIC copy.</p>
            ) : (
              <ul className="divide-y divide-line rounded-[10px] border border-line">
                {docs.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <DocumentList docs={[d]} />
                      <p className="mt-1 text-sm text-muted">
                        {formatBytes(d.size)} · uploaded {formatShortDate(d.createdAt)}
                      </p>
                    </div>
                    <ActionForm action={deleteProfileDocumentAction} showSuccess={false}>
                      <input type="hidden" name="id" value={d.id} />
                      <ConfirmButton question="Remove this file?" confirmText="Remove">
                        Remove
                      </ConfirmButton>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            )}
            <ActionForm action={uploadProfileDocumentAction} resetOnSuccess className="grid gap-4 rounded-[10px] border border-dashed border-line p-4">
              <p className="font-semibold">Upload a document</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Document type" htmlFor="kind">
                  <Select id="kind" name="kind" defaultValue="cv">
                    {DOCUMENT_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>
                        {k.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Description" htmlFor="label" hint="Optional, such as MS degree">
                  <Input id="label" name="label" />
                </Field>
                <Field label="File" htmlFor="file" className="sm:col-span-2">
                  <Input id="file" name="file" type="file" accept={ACCEPT_ATTR} required className="h-auto py-2" />
                </Field>
              </div>
              <div>
                <SubmitButton pendingText="Uploading…">Upload</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
