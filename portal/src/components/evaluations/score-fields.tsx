import type { RubricItem, Scores } from "@/lib/db/schema";

/**
 * One large number field per rubric item. Comfortable to fill in on a phone: full-width rows,
 * a numeric keypad and the range shown next to each label.
 */
export function ScoreFields({ items, scores, disabled }: { items: RubricItem[]; scores: Scores; disabled?: boolean }) {
  if (!items.length) return <p className="text-muted">No rubric has been set for this round yet. Ask HR to add one.</p>;
  return (
    <fieldset className="grid gap-3" disabled={disabled}>
      <legend className="sr-only">Scores</legend>
      {items.map((it) => (
        <div key={it.key} className="flex items-center justify-between gap-4 rounded-[4px] border border-line bg-white px-3 py-3">
          <label htmlFor={`score_${it.key}`} className="min-w-0">
            <span className="block text-base font-medium text-ink">{it.label}</span>
            <span className="block text-sm text-muted">
              0 to {it.maxScore} · weight {it.weight}%{it.minScore ? ` · minimum ${it.minScore}` : ""}
            </span>
          </label>
          <input
            id={`score_${it.key}`}
            name={`score_${it.key}`}
            type="number"
            inputMode="decimal"
            min={0}
            max={it.maxScore}
            step={0.5}
            defaultValue={scores[it.key] ?? ""}
            className="h-12 w-20 shrink-0 rounded-[4px] border border-line bg-white px-2 text-center text-lg tabular-nums text-ink focus:border-teal focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal disabled:bg-off"
          />
        </div>
      ))}
    </fieldset>
  );
}
