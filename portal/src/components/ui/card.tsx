import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-[10px] border border-line bg-white", className)}>{children}</section>;
}

export function CardHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-5 py-5 sm:px-6", className)}>{children}</div>;
}

/** A whole-card link with the DU hover lift. */
export function LinkCard({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-[10px] border border-line bg-white p-5 text-ink no-underline transition-[transform,box-shadow,border-color] duration-200 ease-du",
        "hover:-translate-y-[3px] hover:border-teal hover:shadow-[0_8px_20px_-12px_rgba(0,92,92,0.28)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}
