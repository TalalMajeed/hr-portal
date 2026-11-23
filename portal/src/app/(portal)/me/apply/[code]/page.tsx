import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CircleAlert, CircleCheck } from "lucide-react";
import { db } from "@/lib/db";
import { applications, documents } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { getDoc } from "@/lib/positions";
import { checkEligibility } from "@/lib/eligibility";
import { advertIsOpen, getProfile, postByCode, profileDocuments } from "@/lib/candidate";
import { documentKindLabel } from "@/lib/constants";
import { formatDateTime, relativeDays } from "@/lib/format";
import { ACCEPT_ATTR } from "@/lib/uploads";
import { saveApplicationAction } from "@/actions/candidate";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Notice } from "@/components/ui/notice";
import { ButtonLink } from "@/components/ui/button";
import { DocumentList, STATEMENT_LABELS } from "@/components/applications/profile-view";

export const metadata: Metadata = { title: "Apply" };

const STATEMENT_HINTS: Record<string, string> = {
  letter_of_interest: "Why this post, and what you would bring to DU.",
  teaching_statement: "How you teach and what you would teach here.",
  research_statement: "Your research so far and your plans for the next five years.",
};

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-label="Done" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-label="Missing" />}
      <span>{children}</span>
    </li>
  );
}

export default async function ApplyPage({ params }: PageProps<"/me/apply/[code]">) {
  const user = await requireUser(["candidate"]);
  const { code } = await params;
  const post = postByCode(code);
  if (!post || !post.advert.publishedAt) notFound();
  const { position: p, advert: a } = post;

  const app = db.select().from(applications).where(and(eq(applications.positionId, p.id), eq(applications.candidateId, user.id))).get();
  if (app && app.status !== "draft") redirect(`/me/applications/${app.id}`);

  if (!advertIsOpen(a)) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Careers", href: "/careers" }, { label: p.title }]} title={p.title} />
        <Notice tone="warning" title="This position is closed">
          Applications closed on {formatDateTime(a.closingAt)} PKT. <Link href="/careers">See open positions</Link>
        </Notice>
      </>
    );
  }

  const profile = getProfile(user.id);
  const docs = profileDocuments(user.id);
  const docKinds = docs.map((d) => d.kind);
  const jd = getDoc(p.id, "jd");
  const eligibility = checkEligibility(getDoc(p.id, "criteria"), profile, docKinds);
  const unmet = eligibility.items.filter((i) => !i.met && i.mandatory);
  const extraDocs = app ? db.select().from(documents).where(eq(documents.applicationId, app.id)).all() : [];
  const answers = app?.answers ?? {};
  const isFaculty = p.type === "faculty";

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Careers", href: "/careers" }, { label: p.title, href: `/careers/${p.code}` }, { label: "Apply" }]}
        title={`Apply: ${p.title}`}
        description={`${p.department} · closes ${formatDateTime(a.closingAt)} PKT (${relativeDays(a.closingAt)})`}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <ActionForm action={saveApplicationAction} className="grid min-w-0 gap-6">
          <input type="hidden" name="positionId" value={p.id} />

          {isFaculty && (
            <Card>
              <CardHeader title="Statements" description="Faculty applications need all three." />
              <CardBody className="grid gap-5">
                {Object.entries(STATEMENT_LABELS).map(([key, label]) => (
                  <Field key={key} label={label} htmlFor={key} hint={STATEMENT_HINTS[key]} required>
                    <Textarea id={key} name={key} rows={6} defaultValue={answers[key] ?? ""} maxLength={8000} />
                  </Field>
                ))}
              </CardBody>
            </Card>
          )}

          {(a.questions.length > 0 || a.extraUploads.length > 0) && (
            <Card>
              <CardHeader title="Questions for this post" />
              <CardBody className="grid gap-5">
                {a.questions.map((q) => (
                  <Field key={q.key} label={q.label} htmlFor={q.key} required={q.required}>
                    <Textarea id={q.key} name={q.key} rows={3} defaultValue={answers[q.key] ?? ""} maxLength={4000} />
                  </Field>
                ))}
                {a.extraUploads.map((u) => {
                  const existing = extraDocs.filter((d) => d.label === u.label);
                  return (
                    <Field key={u.key} label={u.label} htmlFor={`upload_${u.key}`} required={u.required} hint="PDF, JPG or PNG">
                      {existing.length > 0 && <DocumentList docs={existing} />}
                      <Input id={`upload_${u.key}`} name={`upload_${u.key}`} type="file" accept={ACCEPT_ATTR} className="h-auto py-2" />
                    </Field>
                  );
                })}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Declaration" />
            <CardBody className="grid gap-5">
              <Checkbox
                name="consent"
                defaultChecked={app?.consent ?? false}
                label="I confirm the information in my profile is true, and I agree that Daanish University may store and process it for recruitment under its data retention policy."
              />
              <p className="text-[15px] text-muted">
                When you submit, DU keeps a copy of your profile as it is now. Later changes to your profile won&apos;t change this application.
              </p>
              <div className="flex flex-wrap gap-3">
                <SubmitButton name="intent" value="submit" pendingText="Submitting…">
                  Submit application
                </SubmitButton>
                <SubmitButton name="intent" value="draft" variant="secondary" pendingText="Saving…">
                  Save draft
                </SubmitButton>
              </div>
            </CardBody>
          </Card>
        </ActionForm>

        <aside className="grid content-start gap-6">
          <Card>
            <CardHeader title="Your profile" />
            <CardBody className="grid gap-4">
              <ul className="grid gap-2 text-[15px]">
                <Check ok={!!profile.cnic && !!profile.dateOfBirth}>Personal details</Check>
                <Check ok={profile.education.length > 0}>
                  {profile.education.length} {profile.education.length === 1 ? "qualification" : "qualifications"}
                </Check>
                <Check ok={profile.experience.length > 0}>
                  {profile.experience.length} {profile.experience.length === 1 ? "job" : "jobs"}
                </Check>
                {isFaculty && <Check ok={profile.publications.length > 0}>{profile.publications.length} publications</Check>}
                {(jd?.requiredDocuments ?? []).map((k) => (
                  <Check key={k} ok={docKinds.includes(k as never)}>
                    {documentKindLabel(k)}
                  </Check>
                ))}
              </ul>
              <ButtonLink href="/me/profile" variant="secondary" size="sm">
                Edit my profile
              </ButtonLink>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Eligibility check" />
            <CardBody className="grid gap-3 text-[15px]">
              {eligibility.items.length === 0 ? (
                <p className="text-muted">This post has no automatic criteria.</p>
              ) : unmet.length === 0 ? (
                <Notice tone="success">Your profile meets the mandatory criteria.</Notice>
              ) : (
                <Notice tone={p.eligibilityMode === "block" ? "error" : "warning"} title="Not met yet">
                  {p.eligibilityMode === "block"
                    ? "This post only accepts applications that meet every mandatory criterion. Update your profile if something is missing."
                    : "You can still apply, but HR will see that these criteria aren't met."}
                </Notice>
              )}
              <ul className="grid gap-2">
                {eligibility.items.map((i) => (
                  <li key={i.key} className="flex items-start gap-2">
                    {i.met ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-label="Met" /> : <CircleAlert className="mt-0.5 size-5 shrink-0 text-warning" aria-label="Not met" />}
                    <span>
                      {i.label}
                      {!i.mandatory && <span className="text-muted"> (desirable)</span>}
                      <span className="block text-sm text-muted">{i.note}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
