import type { ReactNode } from "react";
import type { BoardPack } from "@/lib/board";
import { APPLICATION_STATUS, LIST_STATUS, RECOMMENDATION_LABELS, ROUND_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatShortDate, round1 } from "@/lib/format";
import type { PanelRound, Recommendation } from "@/lib/db/schema";

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid-page border-t border-line pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold">
        {n}. {title}
      </h2>
      <div className="mt-3 text-[15px] leading-relaxed">{children}</div>
    </section>
  );
}

function Grid({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 border-b border-line py-1.5">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-semibold tabular-nums">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const DECISION_LABELS = { recommended: "Recommended", not_recommended: "Not recommended", deferred: "Deferred" } as const;

/** H1: the Selection Board pack. Read-only; used on screen and for print. */
export function BoardPackView({ pack }: { pack: BoardPack }) {
  const { position: p, board, advert, counts, candidates } = pack;
  const rounds = (["interview", "talk", "second_round"] as PanelRound[]).filter((r) => candidates.some((c) => c.rounds[r]));
  let n = 0;
  return (
    <div className="grid gap-6">
      <Section n={++n} title="Position and terms of reference">
        <Grid
          rows={[
            ["Position", p.title],
            ["Code", p.code],
            ["Department", p.department],
            ["Type", p.type === "faculty" ? `Faculty${p.rank ? `, ${p.rank}` : ""}` : "Administrative"],
            ["Grade", p.grade],
            ["Posts", p.posts],
            ["Reporting line", p.reportingLine || "Not set"],
            ["Budget line", p.budgetLine || "Not set"],
          ]}
        />
        {pack.torPosition && (
          <div className="mt-4">
            <p className="font-semibold">Position ToRs</p>
            <p className="whitespace-pre-line">{pack.torPosition}</p>
          </div>
        )}
        {pack.torCommittee && (
          <div className="mt-4">
            <p className="font-semibold">Committee ToRs</p>
            <p className="whitespace-pre-line">{pack.torCommittee}</p>
          </div>
        )}
      </Section>

      <Section n={++n} title="Advertisement">
        {advert ? (
          <>
            <p>
              Published {advert.publishedAt ? formatDate(advert.publishedAt) : "not yet"}, closing {formatDateTime(advert.closingAt)} PKT.
            </p>
            {pack.runs.length > 0 && <p className="mt-1">Ran in: {pack.runs.map((r) => `${r.channel} (${formatShortDate(r.runDate)})`).join("; ")}.</p>}
            <details className="mt-3 print:open">
              <summary className="cursor-pointer font-semibold text-teal print:hidden">Show the ad text</summary>
              <p className="mt-2 whitespace-pre-line rounded-[4px] border border-line bg-off p-4">{advert.body}</p>
            </details>
          </>
        ) : (
          <p className="text-muted">Not advertised.</p>
        )}
      </Section>

      <Section n={++n} title="Applications and shortlisting">
        <Grid
          rows={[
            ["Received", counts.received],
            ["Meet mandatory criteria", counts.eligible],
            ["Screened out", counts.screenedOut],
            ["Reviewed by experts", counts.reviewed],
            ["Long list", counts.longList],
            ["Shortlisted", counts.shortlisted],
            ["Reserve list", counts.reserve],
            ["Interviewed", counts.interviewed],
            ["Direct / agency / referral", `${counts.bySource.direct} / ${counts.bySource.agency} / ${counts.bySource.referral}`],
          ]}
        />
      </Section>

      <Section n={++n} title="Panel composition">
        {pack.panels.length === 0 ? (
          <p className="text-muted">No panel formed.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {pack.panels.map(({ panel, members, conflicts }) => (
              <div key={panel.id}>
                <p className="font-semibold">{ROUND_LABELS[panel.round]} panel</p>
                <ul className="mt-1 grid gap-0.5">
                  {members
                    .filter((m) => m.m.inviteStatus !== "replaced")
                    .map(({ m, u }) => (
                      <li key={m.id}>
                        {u.name}
                        {m.isChair ? " (chair)" : ""}, {u.designation}
                        {u.organisation ? `, ${u.organisation}` : ""}
                        {u.external ? " [external]" : ""}
                      </li>
                    ))}
                </ul>
                {conflicts.length > 0 && <p className="mt-1 text-muted">{conflicts.length} conflict of interest declared; that member did not evaluate the candidate concerned.</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section n={++n} title="Consolidated scores">
        {candidates.length === 0 ? (
          <p className="text-muted">No candidates evaluated yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[4px] border border-line">
            <table className="w-full min-w-[560px] text-left text-[15px]">
              <thead className="border-b border-line bg-off">
                <tr>
                  <th className="px-3 py-2 font-semibold">Candidate</th>
                  <th className="px-3 py-2 text-right font-semibold">Shortlisting</th>
                  {rounds.map((r) => (
                    <th key={r} className="px-3 py-2 text-right font-semibold">
                      {ROUND_LABELS[r]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-semibold">Overall</th>
                  <th className="px-3 py-2 font-semibold">Panel views</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.applicationId} className="border-b border-line last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-sm text-muted">
                        {c.appNo} · {LIST_STATUS[c.listStatus as keyof typeof LIST_STATUS]?.label}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{round1(c.shortlistScore) || "-"}</td>
                    {rounds.map((r) => (
                      <td key={r} className="px-3 py-2 text-right tabular-nums">
                        {c.rounds[r] ? `${round1(c.rounds[r]!.avg)} (${c.rounds[r]!.count})` : "-"}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{round1(c.overall) || "-"}</td>
                    <td className="px-3 py-2 text-sm">
                      {Object.values(c.rounds)
                        .flatMap((r) => r?.recommendations ?? [])
                        .map((x) => RECOMMENDATION_LABELS[x as Recommendation]?.label)
                        .filter(Boolean)
                        .join(", ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-sm text-muted">Scores are weighted percentages from the position&apos;s rubric; the number in brackets is how many panel members scored.</p>
          </div>
        )}
      </Section>

      <Section n={++n} title="Panel's ranked recommendation">
        {pack.consensus && pack.consensus.ranking.length ? (
          <>
            <ol className="list-decimal pl-5">
              {pack.consensus.ranking.map((id) => {
                const c = candidates.find((x) => x.applicationId === id);
                return <li key={id}>{c ? `${c.name} (${c.appNo})` : `Application ${id}`}</li>;
              })}
            </ol>
            {pack.consensus.note && <p className="mt-3 whitespace-pre-line">{pack.consensus.note}</p>}
            <p className="mt-2 text-muted">
              {pack.consensus.signedOffAt ? `Signed off by ${pack.chair?.name ?? "the panel chair"} on ${formatDate(pack.consensus.signedOffAt)}.` : "Not yet signed off by the panel chair."}
            </p>
          </>
        ) : (
          <p className="text-muted">The panel has not recorded a ranked recommendation yet.</p>
        )}
      </Section>

      <Section n={++n} title="Proposed salary and terms">
        <Grid rows={[["Proposed salary", board?.proposedSalary || "Not set"], ["Board meeting", board?.meetingDate ? formatDate(board.meetingDate) : "Not set"]]} />
        {board?.terms && <p className="mt-3 whitespace-pre-line">{board.terms}</p>}
      </Section>

      {(candidates.some((c) => c.decision) || board?.minutes) && (
        <Section n={++n} title="Board decision">
          {candidates.some((c) => c.decision) && (
            <ul className="grid gap-1">
              {candidates
                .filter((c) => c.decision)
                .sort((a, b) => (a.decision!.rank ?? 99) - (b.decision!.rank ?? 99))
                .map((c) => (
                  <li key={c.applicationId}>
                    <span className="font-semibold">{c.name}</span>: {DECISION_LABELS[c.decision!.decision]}
                    {c.decision!.rank ? `, rank ${c.decision!.rank}` : ""}
                    {c.decision!.notes ? `. ${c.decision!.notes}` : ""}
                    {c.offer ? ` Offer ${c.offer.status}.` : ""}
                    <span className="text-muted"> ({APPLICATION_STATUS[c.status as keyof typeof APPLICATION_STATUS]?.label})</span>
                  </li>
                ))}
            </ul>
          )}
          {board?.minutes && (
            <div className="mt-3">
              <p className="font-semibold">Minutes</p>
              <p className="whitespace-pre-line">{board.minutes}</p>
            </div>
          )}
          {pack.minutesDocs.length > 0 && <p className="mt-2 text-muted">Attached: {pack.minutesDocs.map((d) => d.filename).join(", ")}</p>}
          {board?.edSignedOffAt && <p className="mt-2 font-semibold">Signed off by the Executive Director on {formatDate(board.edSignedOffAt)}.</p>}
        </Section>
      )}
    </div>
  );
}
