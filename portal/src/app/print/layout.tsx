import { requireUser } from "@/lib/auth";

/** Bare layout for print-ready pages. Signed-in users only; each page checks its own access. */
export default async function PrintLayout({ children }: LayoutProps<"/print">) {
  await requireUser();
  return <main className="flex-1 bg-off print:bg-white">{children}</main>;
}
