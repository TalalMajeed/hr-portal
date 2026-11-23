import { requireUser } from "@/lib/auth";

export default async function BoardLayout({ children }: LayoutProps<"/board">) {
  await requireUser(["board", "super_admin"]);
  return children;
}
