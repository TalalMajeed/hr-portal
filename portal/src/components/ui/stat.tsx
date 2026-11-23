import Link from "next/link";
import type { ReactNode } from "react";

export function Stat({ label, value, hint, href }: { label: string; value: ReactNode; hint?: ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-[15px] text-muted">{label}</p>
      <p className="mt-1 font-serif text-[32px] font-semibold leading-none text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-2 text-sm text-muted">{hint}</p>}
    </>
  );
  const cls = "block rounded-[10px] border border-line bg-white p-5 no-underline";
  return href ? (
    <Link href={href} className={`${cls} transition-colors duration-150 hover:border-teal`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">{children}</div>;
}
