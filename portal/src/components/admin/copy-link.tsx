"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Shows a secure link with a copy button. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-[4px] text-sm font-semibold text-teal hover:text-teal-dark"
      title={url}
    >
      {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? "Copied" : "Copy secure link"}
    </button>
  );
}
