import type { CriteriaContent, DocKind, JdContent, RubricContent, TorContent } from "@/lib/db/schema";
import { degreeLabel, documentKindLabel, ROUND_LABELS } from "@/lib/constants";

export const DOC_LABELS: Record<DocKind, string> = {
  tor_position: "Position ToRs",
  tor_committee: "Committee ToRs",
  jd: "Job description",
  criteria: "Eligibility criteria",
  rubric: "Evaluation rubric",
};

function List({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="font-semibold">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
    </div>
  );
}

/** Readable view of any version of a ToR, JD, criteria or rubric (A8). */
export function DocPreview({ kind, content }: { kind: DocKind; content: unknown }) {
  if (kind === "tor_position" || kind === "tor_committee") {
    const c = content as TorContent;
    return <p className="whitespace-pre-line">{c.body || <span className="text-muted">Empty</span>}</p>;
  }
  if (kind === "jd") {
    const c = content as JdContent;
    return (
      <div className="grid gap-3 text-[15px]">
        {c.summary && <p>{c.summary}</p>}
        <List title="Duties" items={c.duties} />
        <List title="Required qualifications" items={c.requiredQualifications} />
        <List title="Preferred qualifications" items={c.preferredQualifications} />
        {c.experience && (
          <p>
            <span className="font-semibold">Experience: </span>
            {c.experience}
          </p>
        )}
        <List title="Skills" items={c.skills} />
        <List title="Documents to upload" items={c.requiredDocuments.map(documentKindLabel)} />
      </div>
    );
  }
  if (kind === "criteria") {
    const c = content as CriteriaContent;
    if (!c.items.length) return <p className="text-muted">No criteria.</p>;
    return (
      <ul className="grid gap-1.5 text-[15px]">
        {c.items.map((i) => (
          <li key={i.key}>
            <span className={i.mandatory ? "font-semibold" : ""}>{i.label}</span>
            <span className="text-muted">
              {" "}
              ({i.mandatory ? "mandatory" : "desirable"}
              {i.type === "qualification" ? `, ${degreeLabel(i.value)}${i.field ? ` in ${i.field}` : ""}` : ""}
              {i.type === "age" && i.cutoffDate ? `, cut-off ${i.cutoffDate}` : ""})
            </span>
          </li>
        ))}
      </ul>
    );
  }
  const r = content as RubricContent;
  return (
    <div className="grid gap-3 text-[15px] sm:grid-cols-2">
      {(Object.keys(ROUND_LABELS) as (keyof RubricContent)[]).map((round) => (
        <div key={round}>
          <p className="font-semibold">{ROUND_LABELS[round]}</p>
          {r[round]?.length ? (
            <ul className="mt-1 grid gap-0.5">
              {r[round].map((i) => (
                <li key={i.key}>
                  {i.label} <span className="text-muted">({i.weight}%, max {i.maxScore}, min {i.minScore})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">None</p>
          )}
        </div>
      ))}
    </div>
  );
}
