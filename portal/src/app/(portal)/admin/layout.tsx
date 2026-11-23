import { requireUser } from "@/lib/auth";
import { STAFF_ROLES } from "@/lib/constants";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireUser(STAFF_ROLES);
  return children;
}
