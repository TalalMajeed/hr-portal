import type { Role } from "@/lib/db/schema";

export type NavItem = { href: string; label: string; icon: string; exact?: boolean };

const STAFF_COMMON: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "home", exact: true },
  { href: "/admin/positions", label: "Positions", icon: "briefcase" },
  { href: "/admin/approvals", label: "Approvals", icon: "check" },
  { href: "/admin/schedule", label: "Schedule", icon: "calendar" },
];

const HR_TOOLS: NavItem[] = [
  { href: "/admin/panelists", label: "Panelists", icon: "users" },
  { href: "/admin/reports", label: "Reports", icon: "chart" },
  { href: "/admin/emails", label: "Emails", icon: "mail" },
  { href: "/admin/templates", label: "Templates", icon: "file" },
  { href: "/admin/import", label: "Import", icon: "upload" },
];

const ADMIN_TOOLS: NavItem[] = [
  { href: "/admin/users", label: "Users and roles", icon: "shield" },
  { href: "/admin/audit", label: "Audit log", icon: "list" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];

export function navFor(role: Role): NavItem[] {
  switch (role) {
    case "super_admin":
      return [...STAFF_COMMON, ...HR_TOOLS, ...ADMIN_TOOLS];
    case "hr":
      return [...STAFF_COMMON, ...HR_TOOLS, { href: "/admin/users", label: "Users and roles", icon: "shield" }];
    case "ed":
      return [...STAFF_COMMON, { href: "/admin/panelists", label: "Panelists", icon: "users" }, { href: "/admin/reports", label: "Reports", icon: "chart" }, { href: "/admin/audit", label: "Audit log", icon: "list" }];
    case "hiring_lead":
      return [...STAFF_COMMON, { href: "/admin/panelists", label: "Panelists", icon: "users" }];
    case "reviewer":
      return [{ href: "/review", label: "My reviews", icon: "check" }];
    case "panel":
      return [{ href: "/panel", label: "My panels", icon: "users" }];
    case "board":
      return [{ href: "/board", label: "Board packs", icon: "file" }];
    case "agency":
      return [{ href: "/agency", label: "Open positions", icon: "briefcase" }];
    case "candidate":
      return [
        { href: "/me", label: "My applications", icon: "home", exact: true },
        { href: "/me/profile", label: "My profile", icon: "user" },
        { href: "/careers", label: "Browse jobs", icon: "briefcase" },
      ];
  }
}
