import { STAGES } from "@/lib/constants";
import { cn } from "./cn";

/** The ten recruitment stages, with the current one highlighted. */
export function StageTracker({ stage }: { stage: number }) {
  return (
    <ol aria-label={`Stage ${stage} of 10`} className="grid grid-cols-5 gap-1.5 lg:grid-cols-10">
      {STAGES.map((s) => {
        const state = s.n < stage ? "done" : s.n === stage ? "current" : "todo";
        return (
          <li key={s.n} aria-current={state === "current" ? "step" : undefined} className="min-w-0">
            <div className={cn("h-1.5 rounded-full", state === "done" && "bg-teal", state === "current" && "bg-teal-dark", state === "todo" && "bg-line")} />
            <p className={cn("mt-1.5 truncate text-sm", state === "current" ? "font-semibold text-teal-dark" : state === "done" ? "text-ink" : "text-muted")}>
              {s.n}. {s.short}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

/** Compact "Stage 5 of 10: Shortlisting" label for tables. */
export function StageLabel({ stage }: { stage: number }) {
  const s = STAGES.find((x) => x.n === stage);
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[15px]">
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-tint text-sm font-semibold text-teal-dark tabular-nums">{stage}</span>
      {s?.name}
    </span>
  );
}
