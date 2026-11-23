import { requireUser } from "@/lib/auth";

export default async function PanelLayout({ children }: LayoutProps<"/panel">) {
  await requireUser(["panel"]);
  return children;
}
