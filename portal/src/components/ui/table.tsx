import type { ReactNode, ComponentProps } from "react";
import { cn } from "./cn";

/** Scrolls sideways on narrow screens instead of squashing columns. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto rounded-[10px] border border-line bg-white", className)}>
      <table className="w-full border-collapse text-left text-[15px]">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-line bg-off text-[15px] text-muted">{children}</thead>;
}

export function TH({ children, className, ...props }: ComponentProps<"th">) {
  return (
    <th scope="col" className={cn("whitespace-nowrap px-4 py-3 font-semibold", className)} {...props}>
      {children}
    </th>
  );
}

export function TR({ children, className }: { children: ReactNode; className?: string }) {
  return <tr className={cn("border-b border-line last:border-b-0 hover:bg-off/70", className)}>{children}</tr>;
}

export function TD({ children, className, ...props }: ComponentProps<"td">) {
  return (
    <td className={cn("px-4 py-3 align-top", className)} {...props}>
      {children}
    </td>
  );
}
