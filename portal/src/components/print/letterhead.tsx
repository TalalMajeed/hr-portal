import Image from "next/image";
import type { ReactNode } from "react";
import { PrintButton } from "./print-button";

/** DU letterhead for every print-ready page: ads, the Selection Board pack and reports. */
export function Letterhead({ title, subtitle, children, back }: { title: string; subtitle?: ReactNode; children: ReactNode; back?: string }) {
  return (
    <div className="mx-auto w-full max-w-[860px] bg-white px-5 py-6 sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        {back ? (
          <a href={back} className="text-[15px]">
            Back to the portal
          </a>
        ) : (
          <span />
        )}
        <PrintButton />
      </div>
      <header className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-teal pb-4">
        <Image src="/du-logo.png" alt="Daanish University" width={1057} height={367} className="h-14 w-auto" priority />
        <div className="text-right text-sm text-muted">
          <p>Daanish University</p>
          <p>careers@du.edu.pk · www.du.edu.pk</p>
        </div>
      </header>
      <h1 className="mt-6 font-serif text-[28px] font-semibold leading-tight">{title}</h1>
      {subtitle && <div className="mt-1 text-[15px] text-muted">{subtitle}</div>}
      <div className="mt-6">{children}</div>
      <footer className="mt-10 border-t border-line pt-3 text-sm text-muted">Generated {new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi" })} PKT from the DU Job Portal.</footer>
    </div>
  );
}
