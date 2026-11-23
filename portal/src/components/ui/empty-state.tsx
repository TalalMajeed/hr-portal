import type { ReactNode } from "react";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-line bg-off px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-[55ch] text-[15px] text-muted">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
