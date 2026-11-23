import Image from "next/image";
import Link from "next/link";

export function Logo({ href = "/", className = "h-10 w-auto" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className="inline-flex shrink-0 items-center no-underline" aria-label="Daanish University, home">
      <Image src="/du-logo.png" alt="Daanish University" width={1057} height={367} priority className={className} />
    </Link>
  );
}
