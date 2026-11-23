import type { ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "./cn";

const styles = {
  info: { box: "bg-tint border-tint-line text-teal-dark", Icon: Info },
  success: { box: "bg-success-tint border-success-line text-success", Icon: CircleCheck },
  warning: { box: "bg-warning-tint border-warning-line text-warning", Icon: TriangleAlert },
  error: { box: "bg-danger-tint border-danger-line text-danger", Icon: CircleAlert },
};

export function Notice({ tone = "info", title, children, className }: { tone?: keyof typeof styles; title?: ReactNode; children?: ReactNode; className?: string }) {
  const { box, Icon } = styles[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex gap-3 rounded-[4px] border px-4 py-3 text-[15px]", box, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 text-ink">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title ? "mt-0.5" : "", "text-ink/90")}>{children}</div>}
      </div>
    </div>
  );
}
