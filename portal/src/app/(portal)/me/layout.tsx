import { requireUser } from "@/lib/auth";

export default async function CandidateLayout({ children }: LayoutProps<"/me">) {
  await requireUser(["candidate"]);
  return children;
}
