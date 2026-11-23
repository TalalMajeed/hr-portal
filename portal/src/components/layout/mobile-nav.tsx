"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Menu, X } from "lucide-react";
import type { NavItem } from "./nav-items";
import { NavLinks } from "./nav-links";

/** The sidebar as a slide-down panel on phones and tablets. */
export function MobileNav({ items, footer }: { items: NavItem[]; footer?: ReactNode }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex size-11 items-center justify-center rounded-[4px] text-teal hover:bg-tint"
      >
        {open ? <X className="size-6" /> : <Menu className="size-6" />}
      </button>
      {open && (
        <div id="mobile-nav" className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4rem)] overflow-y-auto border-b border-line bg-white px-4 pb-5 pt-3 shadow-[0_8px_20px_-12px_rgba(0,92,92,0.28)]">
          <NavLinks items={items} onNavigate={() => setOpen(false)} />
          {footer && <div className="mt-4 border-t border-line pt-4">{footer}</div>}
        </div>
      )}
    </div>
  );
}
