import type { RubricItem, Scores } from "@/lib/db/schema";

/**
 * Weighted total on a 0 to 100 scale. Each item counts as score / maxScore times its weight.
 * Returns null when no item has been scored.
 */
export function weightedTotal(scores: Scores | null | undefined, items: RubricItem[]): number | null {
  if (!scores || !items.length) return null;
  const totalWeight = items.reduce((s, i) => s + (i.weight || 0), 0) || 1;
  let sum = 0;
  let any = false;
  for (const it of items) {
    const v = scores[it.key];
    if (typeof v === "number" && Number.isFinite(v) && it.maxScore > 0) {
      any = true;
      sum += (Math.min(v, it.maxScore) / it.maxScore) * (it.weight || 0);
    }
  }
  return any ? (sum / totalWeight) * 100 : null;
}

/** Rubric items where the score is under the item's minimum. */
export function belowMinimum(scores: Scores | null | undefined, items: RubricItem[]) {
  if (!scores) return [];
  return items.filter((i) => typeof scores[i.key] === "number" && scores[i.key] < i.minScore);
}

/** Reads rubric scores from form fields named `score_<key>`, clamped to 0..maxScore. */
export function readScores(fd: FormData, items: RubricItem[]) {
  const scores: Scores = {};
  const errors: string[] = [];
  for (const it of items) {
    const raw = fd.get(`score_${it.key}`);
    if (raw === null || String(raw).trim() === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > it.maxScore) {
      errors.push(`${it.label} must be between 0 and ${it.maxScore}.`);
      continue;
    }
    scores[it.key] = n;
  }
  return { scores, errors, complete: items.every((i) => typeof scores[i.key] === "number") };
}

export type RankedRow<T> = T & { total: number | null; rank: number | null };

/** Sorts rows by total (highest first) and gives tied totals the same rank. */
export function rankByTotal<T extends { total: number | null }>(rows: T[]): (T & { rank: number | null })[] {
  const sorted = [...rows].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  let lastTotal: number | null = null;
  let lastRank = 0;
  return sorted.map((r, i) => {
    if (r.total === null) return { ...r, rank: null };
    const rank = r.total === lastTotal ? lastRank : i + 1;
    lastTotal = r.total;
    lastRank = rank;
    return { ...r, rank };
  });
}
