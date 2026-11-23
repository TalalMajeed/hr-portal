"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";

export default function PortalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid max-w-xl gap-4">
      <Notice tone="error" title="This page didn't load">
        Something went wrong on our side. Try again; if it keeps happening, tell DU IT what you were doing.
      </Notice>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
