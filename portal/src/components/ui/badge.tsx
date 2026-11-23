import type { ReactNode } from "react";
import type { Tone } from "@/lib/constants";
import { cn } from "./cn";

const tones: Record<Tone, string> = {
  teal: "bg-tint text-teal-dark border-tint-line",
  success: "bg-success-tint text-success border-success-line",
  warning: "bg-warning-tint text-warning border-warning-line",
  danger: "bg-danger-tint text-danger border-danger-line",
  neutral: "bg-off text-muted border-line",
  sand: "bg-sand-tint text-sand-text border-sand-line",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-sm font-medium", tones[tone], className)}>
      {children}
    </span>
  );
}
