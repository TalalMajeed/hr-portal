import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto bg-teal-dark text-white no-print">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-3">
        <div>
          <p className="font-serif text-2xl font-semibold">Daanish University</p>
          <p className="mt-2 max-w-[40ch] text-[15px] text-white/85">Pakistan&apos;s centre for scientific excellence and STEAM education.</p>
        </div>
        <nav aria-label="Footer">
          <p className="text-[15px] font-semibold">Careers</p>
          <ul className="mt-2 space-y-1.5 text-[15px]">
            <li><Link className="text-white/85 no-underline hover:text-white" href="/careers">Open positions</Link></li>
            <li><Link className="text-white/85 no-underline hover:text-white" href="/register">Create an account</Link></li>
            <li><Link className="text-white/85 no-underline hover:text-white" href="/login">Sign in</Link></li>
          </ul>
        </nav>
        <div>
          <p className="text-[15px] font-semibold">Contact</p>
          <ul className="mt-2 space-y-1.5 text-[15px] text-white/85">
            <li>careers@du.edu.pk</li>
            <li><a className="text-white/85 no-underline hover:text-white" href="https://www.du.edu.pk">www.du.edu.pk</a></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/15">
        <p className="mx-auto max-w-6xl px-4 py-4 text-sm text-white/75 sm:px-6">© {new Date().getFullYear()} Daanish University. All rights reserved.</p>
      </div>
    </footer>
  );
}
