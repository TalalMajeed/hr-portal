import Link from "next/link";
import { and, asc, eq, gt } from "drizzle-orm";
import { ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { adverts, positions } from "@/lib/db/schema";
import { formatDate } from "@/lib/format";
import { ButtonLink } from "@/components/ui/button";
import { LinkCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default function HomePage() {
  const open = db
    .select({ p: positions, a: adverts })
    .from(adverts)
    .innerJoin(positions, eq(positions.id, adverts.positionId))
    .where(and(eq(adverts.status, "published"), gt(adverts.closingAt, new Date().toISOString())))
    .orderBy(asc(adverts.closingAt))
    .limit(6)
    .all();

  return (
    <>
      <section className="bg-teal-dark text-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="max-w-[18ch] font-serif text-[36px] font-semibold leading-tight tracking-tight sm:text-[52px]">Work at Daanish University</h1>
          <p className="mt-5 max-w-[58ch] text-[17px] leading-[1.7] text-white/90 sm:text-lg">
            Join a new university built for scientific excellence and STEAM education. We are hiring founding faculty across the disciplines and the people who
            run the university behind them.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/careers" variant="light">
              See open positions
            </ButtonLink>
            <ButtonLink href="/register" variant="inverse">
              Create an account
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="bg-white py-10 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-serif text-[30px] font-semibold tracking-tight sm:text-[36px]">Open positions</h2>
            <Link href="/careers" className="inline-flex items-center gap-1 text-[15px] font-semibold no-underline">
              All positions <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          {open.length === 0 ? (
            <p className="mt-6 text-muted">There are no open positions right now. Check back soon.</p>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {open.map(({ p, a }) => (
                <li key={p.id}>
                  <LinkCard href={`/careers/${p.code}`} className="h-full">
                    <Badge tone={p.type === "faculty" ? "teal" : "sand"}>{p.type === "faculty" ? "Faculty" : "Administrative"}</Badge>
                    <p className="mt-3 text-lg font-semibold leading-snug">{p.title}</p>
                    <p className="mt-1 text-[15px] text-muted">{p.department}</p>
                    <p className="mt-3 text-[15px] text-muted">Closes {formatDate(a.closingAt)}</p>
                  </LinkCard>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="bg-tint py-10 sm:py-14">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="font-serif text-[30px] font-semibold tracking-tight sm:text-[36px]">How to apply</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              ["Create your profile", "Register once with your email and mobile number. Your profile, qualifications and documents are reused for every application."],
              ["Apply to a post", "Pick a position, answer any questions and submit before the closing date. You'll get an application number and an email."],
              ["Track every step", "Your dashboard shows each application's status, interview invitations and messages from DU HR."],
            ].map(([title, body], i) => (
              <li key={title} className="rounded-[10px] border border-line bg-white p-5">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-teal text-[15px] font-semibold text-white">{i + 1}</span>
                <p className="mt-3 text-lg font-semibold">{title}</p>
                <p className="mt-1 text-[15px] text-muted">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
