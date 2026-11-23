import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { ROLE_HOME, ROLE_LABELS } from "@/lib/constants";
import { signOutAction } from "@/actions/auth";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { NavLinks } from "./nav-links";
import { navFor } from "./nav-items";

function UserBlock({ user }: { user: SessionUser }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <a href="/account" className="min-w-0 no-underline">
        <p className="truncate text-[15px] font-semibold text-ink">{user.name}</p>
        <p className="truncate text-sm text-muted">{ROLE_LABELS[user.role]}</p>
      </a>
      <form action={signOutAction}>
        <button type="submit" className="inline-flex size-11 items-center justify-center rounded-[4px] text-muted hover:bg-off hover:text-teal" aria-label="Sign out" title="Sign out">
          <LogOut className="size-5" />
        </button>
      </form>
    </div>
  );
}

/** The signed-in layout: sidebar on desktop, top bar with a menu on phones and tablets. */
export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const items = [...navFor(user.role), { href: "/account", label: "My account", icon: "user" }];
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-hairline bg-white lg:flex no-print">
        <div className="flex h-16 items-center border-b border-hairline px-5">
          <Logo href={ROLE_HOME[user.role]} />
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <NavLinks items={items} />
        </nav>
        <div className="border-t border-hairline px-4 py-3">
          <UserBlock user={user} />
        </div>
      </aside>
      <header className="sticky top-0 z-50 border-b border-hairline bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] lg:hidden no-print">
        <div className="relative flex h-16 items-center justify-between px-4">
          <Logo href={ROLE_HOME[user.role]} className="h-9 w-auto" />
          <MobileNav items={items} footer={<UserBlock user={user} />} />
        </div>
      </header>
      <main id="main" className="min-w-0 flex-1 bg-off">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</div>
      </main>
    </div>
  );
}
