import Link from "next/link";
import { getUser } from "@/lib/auth";
import { ROLE_HOME } from "@/lib/constants";
import { ButtonLink } from "@/components/ui/button";
import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";

export async function SiteHeader() {
  const user = await getUser();
  const links = [{ href: "/careers", label: "Careers", icon: "briefcase" }];
  return (
    <header className="sticky top-0 z-50 border-b border-hairline bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)] no-print">
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="px-3 py-2 text-[15px] font-bold tracking-[0.01em] text-ink no-underline transition-colors duration-150 hover:text-teal">
              {l.label}
            </Link>
          ))}
          {user ? (
            <ButtonLink href={ROLE_HOME[user.role]} size="sm" className="ml-2">
              My dashboard
            </ButtonLink>
          ) : (
            <>
              <Link href="/login" className="px-3 py-2 text-[15px] font-bold tracking-[0.01em] text-ink no-underline hover:text-teal">
                Sign in
              </Link>
              <ButtonLink href="/register" size="sm" className="ml-2">
                Create account
              </ButtonLink>
            </>
          )}
        </nav>
        <div className="md:hidden">
          <MobileNav
            items={
              user
                ? [...links, { href: ROLE_HOME[user.role], label: "My dashboard", icon: "home" }]
                : [...links, { href: "/login", label: "Sign in", icon: "user" }, { href: "/register", label: "Create account", icon: "user" }]
            }
          />
        </div>
      </div>
    </header>
  );
}
