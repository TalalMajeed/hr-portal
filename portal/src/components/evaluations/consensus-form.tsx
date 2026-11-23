import type { consensus, PanelRound } from "@/lib/db/schema";
import { formatDateTime, round1 } from "@/lib/format";
import { saveConsensusAction, signOffConsensusAction } from "@/actions/evaluations";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Field, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";

type Row = { appId: number; name: string; total: number | null; rank: number | null };

/** G6: consensus note and ranked recommendation; the chair signs it off. */
export function ConsensusForm({
  positionId,
  round,
  rows,
  existing,
  canEdit,
  isChair,
  chairName,
}: {
  positionId: number;
  round: PanelRound;
  rows: Row[];
  existing: typeof consensus.$inferSelect | null;
  canEdit: boolean;
  isChair: boolean;
  chairName?: string;
}) {
  const signed = !!existing?.signedOffAt;
  const order = existing?.ranking ?? [];
  const sorted = [...rows].sort((a, b) => {
    const ia = order.indexOf(a.appId);
    const ib = order.indexOf(b.appId);
    if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    return (a.rank ?? 999) - (b.rank ?? 999);
  });
  if (signed) {
    return (
      <div className="grid gap-3">
        <Notice tone="success" title={`Signed off by ${chairName ?? "the chair"} on ${formatDateTime(existing!.signedOffAt)}`} />
        <ol className="grid gap-2">
          {sorted.filter((r) => order.includes(r.appId)).map((r, i) => (
            <li key={r.appId} className="flex items-center gap-3">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-teal text-[15px] font-semibold text-white">{i + 1}</span>
              <span className="font-medium">{r.name}</span>
              {r.total !== null && <span className="text-[15px] text-muted">average {round1(r.total)}</span>}
            </li>
          ))}
        </ol>
        {existing?.note && <p className="whitespace-pre-line">{existing.note}</p>}
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {canEdit ? (
        <ActionForm action={saveConsensusAction} className="grid gap-4">
          <input type="hidden" name="positionId" value={positionId} />
          <input type="hidden" name="round" value={round} />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-[15px] font-medium">Final ranking (1 is the strongest; leave blank to leave someone out)</legend>
            {sorted.map((r) => {
              const idx = order.indexOf(r.appId);
              return (
                <label key={r.appId} className="flex items-center justify-between gap-3 rounded-[4px] border border-line bg-white px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium">{r.name}</span>
                    <span className="block text-sm text-muted">{r.total !== null ? `Average ${round1(r.total)} out of 100` : "No scores yet"}</span>
                  </span>
                  <input
                    type="number"
                    name={`rank_${r.appId}`}
                    min={1}
                    max={rows.length}
                    inputMode="numeric"
                    aria-label={`Rank for ${r.name}`}
                    defaultValue={idx >= 0 ? idx + 1 : (r.rank ?? "")}
                    className="h-11 w-16 shrink-0 rounded-[4px] border border-line text-center text-base tabular-nums focus:border-teal focus:outline-none"
                  />
                </label>
              );
            })}
          </fieldset>
          <Field label="Consensus note" htmlFor={`cn-${round}`} hint="The panel's agreed view, with reasons">
            <Textarea id={`cn-${round}`} name="note" rows={4} defaultValue={existing?.note} />
          </Field>
          <div>
            <SubmitButton variant="secondary">Save consensus</SubmitButton>
          </div>
        </ActionForm>
      ) : (
        <p className="text-muted">HR or the panel chair records the consensus.</p>
      )}
      {isChair && existing && existing.ranking.length > 0 && (
        <ActionForm action={signOffConsensusAction}>
          <input type="hidden" name="positionId" value={positionId} />
          <input type="hidden" name="round" value={round} />
          <ConfirmButton variant="primary" size="md" question="Sign off? It can't be changed after." confirmText="Sign off">
            Sign off as chair
          </ConfirmButton>
        </ActionForm>
      )}
      {!isChair && existing && existing.ranking.length > 0 && <Notice>Waiting for {chairName ?? "the panel chair"} to sign off.</Notice>}
    </div>
  );
}
