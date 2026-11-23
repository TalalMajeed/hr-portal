import { FileText } from "lucide-react";
import type { AdvertQuestion, ProfileSnapshot } from "@/lib/db/schema";
import { degreeLabel, documentKindLabel } from "@/lib/constants";
import { formatShortDate } from "@/lib/format";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Detail, DetailGrid } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";

const PUB_STATUS = { published: "Published", accepted: "Accepted", under_review: "Under review" } as const;
const ARTICLE_TYPE = { original_research: "Original research", review: "Review", book_chapter: "Book chapter" } as const;

export const STATEMENT_LABELS: Record<string, string> = {
  letter_of_interest: "Letter of interest",
  teaching_statement: "Teaching statement / vision statement",
  research_statement: "Research statement",
};

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/**
 * Shows a candidate's application as submitted (C8: the frozen snapshot), or a live profile.
 * Used by HR, reviewers, panel members, the Selection Board, agencies and the candidate.
 */
export function ProfileView({
  snapshot,
  answers,
  questions = [],
  showPersonal = true,
}: {
  snapshot: ProfileSnapshot;
  answers?: Record<string, string>;
  questions?: AdvertQuestion[];
  showPersonal?: boolean;
}) {
  const p = snapshot.profile;
  const statementKeys = Object.keys(STATEMENT_LABELS).filter((k) => answers?.[k]);
  return (
    <div className="grid gap-6">
      {showPersonal && (
        <Card>
          <CardHeader title="Personal details" />
          <CardBody>
            <DetailGrid>
              <Detail label="Name">{snapshot.name}</Detail>
              <Detail label="Email">{snapshot.email.endsWith("@placeholder.local") ? "" : snapshot.email}</Detail>
              <Detail label="Mobile">{snapshot.phone}</Detail>
              <Detail label="CNIC">{p.cnic}</Detail>
              <Detail label="Date of birth">{p.dateOfBirth ? formatShortDate(p.dateOfBirth) : ""}</Detail>
              <Detail label="Gender">{p.gender}</Detail>
              <Detail label="Domicile">{p.domicile}</Detail>
              <Detail label="Province">{p.province}</Detail>
              <Detail label="City and country">{[p.city, p.country].filter(Boolean).join(", ")}</Detail>
              <Detail label="Time zone">{p.timezone}</Detail>
              {p.researchInterests && <Detail label="Research interests">{p.researchInterests}</Detail>}
            </DetailGrid>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Qualifications" />
        <CardBody className="p-0 sm:p-0">
          {p.education.length === 0 ? (
            <p className="px-5 py-5 text-muted sm:px-6">None entered.</p>
          ) : (
            <ul className="divide-y divide-line">
              {p.education.map((e, i) => (
                <li key={i} className="px-5 py-4 sm:px-6">
                  <p className="font-semibold">{e.degree}</p>
                  <p className="text-[15px] text-muted">
                    {e.institution} · {e.year} · {degreeLabel(e.level)}
                    {e.grade ? ` · Grade ${e.grade}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Experience" />
        <CardBody className="p-0 sm:p-0">
          {p.experience.length === 0 ? (
            <p className="px-5 py-5 text-muted sm:px-6">None entered.</p>
          ) : (
            <ul className="divide-y divide-line">
              {p.experience.map((e, i) => (
                <li key={i} className="px-5 py-4 sm:px-6">
                  <p className="font-semibold">
                    {e.designation}, {e.employer}
                  </p>
                  <p className="text-[15px] text-muted">
                    {formatShortDate(e.from)} to {e.current || !e.to ? "present" : formatShortDate(e.to)}
                  </p>
                  {e.duties && <p className="mt-1 text-[15px]">{e.duties}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {p.publications.length > 0 && (
        <Card>
          <CardHeader title="Research and publications" description={`${p.publications.length} entered`} />
          <CardBody className="p-0 sm:p-0">
            <ul className="divide-y divide-line">
              {p.publications.map((pub, i) => (
                <li key={i} className="px-5 py-4 sm:px-6">
                  <p className="font-semibold">{pub.title}</p>
                  <p className="text-[15px] text-muted">
                    {pub.journal}, {pub.year}
                  </p>
                  <p className="mt-1 text-[15px]">{pub.authors}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge tone={pub.status === "published" ? "success" : "warning"}>{PUB_STATUS[pub.status]}</Badge>
                    <Badge tone="teal">{ordinal(pub.authorPosition)} author</Badge>
                    <Badge>{ARTICLE_TYPE[pub.articleType]}</Badge>
                    {pub.quartile && <Badge tone="sand">{pub.quartile}</Badge>}
                    {pub.doi && (
                      <a className="text-[15px]" href={pub.doi.startsWith("http") ? pub.doi : `https://doi.org/${pub.doi}`} target="_blank" rel="noreferrer">
                        {pub.doi}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {(statementKeys.length > 0 || questions.length > 0) && (
        <Card>
          <CardHeader title="Statements and answers" />
          <CardBody className="grid gap-5">
            {statementKeys.map((k) => (
              <div key={k}>
                <p className="text-sm text-muted">{STATEMENT_LABELS[k]}</p>
                <p className="mt-1 whitespace-pre-line">{answers?.[k]}</p>
              </div>
            ))}
            {questions.map((q) => (
              <div key={q.key}>
                <p className="text-sm text-muted">{q.label}</p>
                <p className="mt-1 whitespace-pre-line">{answers?.[q.key] || <span className="text-muted">Not answered</span>}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {p.references.length > 0 && (
        <Card>
          <CardHeader title="References" />
          <CardBody>
            <ul className="grid gap-4 sm:grid-cols-2">
              {p.references.map((r, i) => (
                <li key={i}>
                  <p className="font-semibold">{r.name}</p>
                  <p className="text-[15px] text-muted">
                    {[r.designation, r.organisation].filter(Boolean).join(", ")}
                  </p>
                  <p className="text-[15px]">{[r.email, r.phone].filter(Boolean).join(" · ")}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Documents" />
        <CardBody>
          <DocumentList docs={snapshot.documents} />
        </CardBody>
      </Card>
    </div>
  );
}

export function DocumentList({ docs }: { docs: { id: number; kind: string; filename: string; label?: string }[] }) {
  if (!docs.length) return <p className="text-muted">No documents.</p>;
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {docs.map((d) => (
        <li key={d.id}>
          <a
            href={`/api/files/${d.id}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-[4px] border border-line px-3 py-2.5 no-underline transition-colors duration-150 hover:border-teal hover:bg-tint"
          >
            <FileText className="size-5 shrink-0 text-teal" aria-hidden />
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-ink">{d.label || documentKindLabel(d.kind)}</span>
              <span className="block truncate text-sm text-muted">{d.filename}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
