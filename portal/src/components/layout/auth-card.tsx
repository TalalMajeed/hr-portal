import type { ReactNode } from "react";

/** Centred card used by sign-in, registration and password pages. */
export function AuthCard({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex flex-1 items-start justify-center bg-off px-4 py-10 sm:py-16">
      <div className="w-full max-w-md">
        <div className="rounded-[10px] border border-line bg-white px-5 py-7 sm:px-8">
          <h1 className="font-serif text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
          {description && <p className="mt-2 text-[15px] text-muted">{description}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-[15px] text-muted">{footer}</div>}
      </div>
    </div>
  );
}
