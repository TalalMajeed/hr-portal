import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { CircleCheck } from "lucide-react";
import { db } from "@/lib/db";
import { applications } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { getDoc } from "@/lib/positions";
import { advertIsOpen, postByCode } from "@/lib/candidate";
import { documentKindLabel } from "@/lib/constants";
import { formatDateTime, relativeDays } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Card, CardBody, CardHeader } from "@/components/ui/card";

export async function generateMetadata({ params }: PageProps<"/careers/[code]">): Promise<Metadata> {
  const { code } = await params;
  const post = postByCode(code);
  return { title: post ? post.position.title : "Position" };
}

function List({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="grid gap-1.5">
      {items.map((i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-teal" aria-hidden />
          <span>{i}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function PostPage({ params }: PageProps<"/careers/[code]">) {
  const { code } = await params;
  const post = postByCode(code);
  if (!post || !post.advert.publishedAt || ["draft", "pending_approval"].includes(post.advert.status)) notFound();
  const { position: p, advert: a } = post;
  const open = advertIsOpen(a);
  const jd = getDoc(p.id, "jd");
  const criteria = getDoc(p.id, "criteria");
  const user = await getUser();
  const mine =
    user?.role === "candidate"
      ? db.select().from(applications).where(and(eq(applications.positionId, p.id), eq(applications.candidateId, user.id))).get()
      : undefined;

  const applyHref = `/me/apply/${p.code}`;
  const applyAction = !open ? null : !user ? (
    <ButtonLink href={`/login?next=${encodeURIComponent(applyHref)}`}>Sign in to apply</ButtonLink>
  ) : user.role !== "candidate" ? (
    <p className="text-[15px] text-muted">Staff and agency accounts can&apos;t apply. Sign in with a candidate account.</p>
  ) : mine && mine.status !== "draft" ? (
    <ButtonLink href={`/me/applications/${mine.id}`} variant="secondary">
      View your application
    </ButtonLink>
  ) : (
    <ButtonLink href={applyHref}>{mine ? "Continue your application" : "Apply"}</ButtonLink>
  );

  return (
    <div className="bg-off">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Badge tone={p.type === "faculty" ? "teal" : "sand"}>{p.type === "faculty" ? "Faculty" : "Administrative"}</Badge>
            <Badge>{p.code}</Badge>
          </div>
          <h1 className="mt-3 font-serif text-[32px] font-semibold leading-tight tracking-tight sm:text-[40px]">{p.title}</h1>
          <p className="mt-2 text-[17px] text-muted">{p.department}</p>

          {!open && (
            <Notice tone="warning" title="This position is closed" className="mt-6">
              It no longer takes applications. See the other open positions on the careers page.
            </Notice>
          )}

          <div className="mt-6 grid gap-6">
            <Card>
              <CardHeader title="About the role" />
              <CardBody className="grid gap-5">
                {jd?.summary && <p>{jd.summary}</p>}
                <div className="whitespace-pre-line text-[15px] text-muted">{a.body}</div>
                {!!jd?.duties.length && (
                  <div>
                    <h2 className="mb-2 font-semibold">Duties</h2>
                    <List items={jd.duties} />
                  </div>
                )}
                {p.type === "faculty" && (p.researchArea || p.teachingAreas) && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {p.rank && (
                      <div>
                        <h2 className="font-semibold">Rank</h2>
                        <p>{p.rank}</p>
                      </div>
                    )}
                    {p.researchArea && (
                      <div>
                        <h2 className="font-semibold">Research area</h2>
                        <p>{p.researchArea}</p>
                      </div>
                    )}
                    {p.teachingAreas && (
                      <div className="sm:col-span-2">
                        <h2 className="font-semibold">Teaching areas</h2>
                        <p>{p.teachingAreas}</p>
                      </div>
                    )}
                  </div>
                )}
              </CardBody>
            </Card>

            {jd && (
              <Card>
                <CardHeader title="Qualifications and experience" />
                <CardBody className="grid gap-5">
                  {!!jd.requiredQualifications.length && (
                    <div>
                      <h2 className="mb-2 font-semibold">Required</h2>
                      <List items={jd.requiredQualifications} />
                    </div>
                  )}
                  {!!jd.preferredQualifications.length && (
                    <div>
                      <h2 className="mb-2 font-semibold">Preferred</h2>
                      <List items={jd.preferredQualifications} />
                    </div>
                  )}
                  {jd.experience && (
                    <div>
                      <h2 className="mb-1 font-semibold">Experience</h2>
                      <p>{jd.experience}</p>
                    </div>
                  )}
                  {!!jd.skills.length && (
                    <div>
                      <h2 className="mb-2 font-semibold">Skills</h2>
                      <div className="flex flex-wrap gap-2">
                        {jd.skills.map((s) => (
                          <Badge key={s}>{s}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            )}

            {!!criteria?.items.length && (
              <Card>
                <CardHeader title="Eligibility criteria" description="Mandatory criteria are checked when you submit." />
                <CardBody className="p-0 sm:p-0">
                  <ul className="divide-y divide-line">
                    {criteria.items.map((c) => (
                      <li key={c.key} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 sm:px-6">
                        <span className="min-w-0">{c.label}</span>
                        <Badge tone={c.mandatory ? "teal" : "neutral"}>{c.mandatory ? "Mandatory" : "Desirable"}</Badge>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="grid gap-4">
              <dl className="grid gap-3 text-[15px]">
                <div>
                  <dt className="text-sm text-muted">Grade or pay scale</dt>
                  <dd className="font-semibold">{p.grade}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Vacancies</dt>
                  <dd className="font-semibold">{p.posts}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Closing date</dt>
                  <dd className="font-semibold">{formatDateTime(a.closingAt)} PKT</dd>
                  {open && <dd className="text-muted">Closes {relativeDays(a.closingAt)}</dd>}
                </div>
              </dl>
              {!!jd?.requiredDocuments.length && (
                <div>
                  <p className="text-sm text-muted">Documents you&apos;ll need</p>
                  <ul className="mt-1 grid gap-1 text-[15px]">
                    {jd.requiredDocuments.map((d) => (
                      <li key={d} className="flex items-center gap-2">
                        <CircleCheck className="size-4 text-teal" aria-hidden /> {documentKindLabel(d)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {applyAction}
            </CardBody>
          </Card>
        </aside>
      </div>
    </div>
  );
}
