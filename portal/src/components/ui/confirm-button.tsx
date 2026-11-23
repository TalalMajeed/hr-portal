"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, type ButtonSize, type ButtonVariant } from "./button";

/**
 * A submit button that asks once before it submits. Use inside a form for
 * destructive or irreversible actions.
 */
export function ConfirmButton({
  children,
  confirmText = "Confirm",
  question = "Are you sure?",
  variant = "danger",
  size = "sm",
  name,
  value,
}: {
  children: ReactNode;
  confirmText?: string;
  question?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  name?: string;
  value?: string;
}) {
  const [armed, setArmed] = useState(false);
  const { pending } = useFormStatus();
  if (!armed) {
    return (
      <button type="button" className={buttonClass(variant, size)} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="text-[15px] text-ink">{question}</span>
      <button type="submit" name={name} value={value} disabled={pending} className={buttonClass(variant === "danger" ? "danger" : "primary", size)} autoFocus>
        {pending ? "Working…" : confirmText}
      </button>
      <button type="button" className={buttonClass("ghost", size)} onClick={() => setArmed(false)}>
        Cancel
      </button>
    </span>
  );
}
