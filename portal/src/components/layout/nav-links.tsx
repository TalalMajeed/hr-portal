"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  CircleCheck,
  FileText,
  House,
  List,
  Mail,
  Settings,
  ShieldCheck,
  Upload,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavItem } from "./nav-items";
import { cn } from "@/components/ui/cn";

const ICONS: Record<string, LucideIcon> = {
  home: House,
  briefcase: Briefcase,
  check: CircleCheck,
  calendar: CalendarDays,
  users: Users,
  chart: BarChart3,
  mail: Mail,
  file: FileText,
  upload: Upload,
  shield: ShieldCheck,
  list: List,
  settings: Settings,
  user: User,
};

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = ICONS[item.icon] ?? House;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-[4px] px-3 text-[15px] font-semibold no-underline transition-colors duration-150",
                active ? "bg-tint text-teal-dark" : "text-ink hover:bg-off hover:text-teal",
              )}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
