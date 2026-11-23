"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import type { ActionState } from "@/lib/action-state";
import { Notice } from "./notice";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * Wraps a server action: shows its error or success message above the fields,
 * and moves focus to the message so screen readers and keyboards land on it.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  showSuccess = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const formRef = useRef<HTMLFormElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    if (state.ok && resetOnSuccess) formRef.current?.reset();
    if (state.error || (state.ok && showSuccess && state.message)) msgRef.current?.focus();
  }, [state, resetOnSuccess, showSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className} noValidate={false}>
      <div ref={msgRef} tabIndex={-1} className="outline-none empty:hidden">
        {state?.error && (
          <Notice tone="error" className="mb-4">
            {state.error}
          </Notice>
        )}
        {state?.ok && showSuccess && state.message && (
          <Notice tone="success" className="mb-4">
            {state.message}
          </Notice>
        )}
      </div>
      {children}
    </form>
  );
}
