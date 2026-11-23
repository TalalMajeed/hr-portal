import { requireUser } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";

export default async function PortalLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return <AppShell user={user}>{children}</AppShell>;
}
