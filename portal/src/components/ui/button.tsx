import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "light" | "inverse" | "danger";
export type ButtonSize = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-[2px] border font-semibold tracking-[0.01em] no-underline whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform] duration-150 ease-du active:scale-[0.97] " +
  "disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-teal border-teal text-white hover:bg-teal-dark hover:border-teal-dark",
  secondary: "bg-transparent border-teal text-teal hover:bg-teal hover:text-white",
  ghost: "bg-transparent border-transparent text-teal hover:bg-tint",
  light: "bg-transparent border-white text-white hover:bg-white hover:text-teal-dark",
  inverse: "bg-white border-white text-teal-dark hover:bg-tint hover:border-tint",
  danger: "bg-white border-danger text-danger hover:bg-danger hover:text-white",
};

const sizes: Record<ButtonSize, string> = {
  md: "min-h-11 px-5 py-2.5 text-[15px]",
  sm: "min-h-9 px-3.5 py-1.5 text-[15px]",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type Common = { variant?: ButtonVariant; size?: ButtonSize; className?: string; children: ReactNode };

export function Button({ variant, size, className, ...props }: Common & ComponentProps<"button">) {
  return <button type={props.type ?? "button"} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({ variant, size, className, ...props }: Common & ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** For downloads and API routes that must not go through client navigation. */
export function ButtonAnchor({ variant, size, className, ...props }: Common & ComponentProps<"a">) {
  return <a className={buttonClass(variant, size, className)} {...props} />;
}
