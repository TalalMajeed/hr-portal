"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui/button";

export function PrintButton({ label = "Save as PDF or print" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "md")}>
      <Printer aria-hidden /> {label}
    </button>
  );
}
