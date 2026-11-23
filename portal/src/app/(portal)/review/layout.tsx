import { requireUser } from "@/lib/auth";

export default async function ReviewLayout({ children }: LayoutProps<"/review">) {
  await requireUser(["reviewer"]);
  return children;
}
