import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-off px-4 py-16 text-center">
      <Logo />
      <h1 className="mt-8 font-serif text-[32px] font-semibold">Page not found</h1>
      <p className="mt-2 max-w-[45ch] text-muted">The page may have moved, or you may not have access to it. Check the link, or go back to the start.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-4 text-[15px] font-semibold">
        <Link href="/">Home</Link>
        <Link href="/careers">Open positions</Link>
        <Link href="/login">Sign in</Link>
      </div>
    </main>
  );
}
