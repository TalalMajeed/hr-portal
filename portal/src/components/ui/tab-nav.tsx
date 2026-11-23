"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";

export type Tab = { href: string; label: string; count?: number; exact?: boolean };

/** Section tabs as links, so each tab has its own URL. Scrolls sideways on phones. */
export function TabNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Sections" className="-mx-4 mb-6 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex items-center gap-2 border-b-2 px-3 py-3 text-[15px] font-semibold no-underline transition-colors duration-150",
                  active ? "border-teal text-teal" : "border-transparent text-ink hover:text-teal",
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={cn("rounded-full px-2 text-sm tabular-nums", active ? "bg-tint text-teal-dark" : "bg-off text-muted")}>{t.count}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
