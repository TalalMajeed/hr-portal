import { requireUser } from "@/lib/auth";

export default async function AgencyLayout({ children }: LayoutProps<"/agency">) {
  await requireUser(["agency"]);
  return children;
}
