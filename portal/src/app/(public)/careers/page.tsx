import type { Metadata } from "next";
import { and, asc, eq, gt, like, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, positions } from "@/lib/db/schema";
import { DEPARTMENTS } from "@/lib/constants";
import { formatDate, relativeDays } from "@/lib/format";
import { LinkCard } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Careers", description: "Open faculty and administrative positions at Daanish University." };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function CareersPage({ searchParams }: PageProps<"/careers">) {
  const sp = await searchParams;
  const q = one(sp.q).trim();
  const dept = one(sp.dept);
  const type = one(sp.type);
  const closes = one(sp.closes);
  const now = new Date();

  const where = [eq(adverts.status, "published"), gt(adverts.closingAt, now.toISOString())];
  if (q) where.push(or(like(positions.title, `%${q}%`), like(positions.department, `%${q}%`), like(positions.discipline, `%${q}%`))!);
  if (dept) where.push(eq(positions.department, dept));
  if (type === "faculty" || type === "administrative") where.push(eq(positions.type, type));
  if (closes === "7" || closes === "30") where.push(lte(adverts.closingAt, new Date(now.getTime() + Number(closes) * 86_400_000).toISOString()));

  const rows = db
    .select({ p: positions, a: adverts })
    .from(adverts)
    .innerJoin(positions, eq(positions.id, adverts.positionId))
    .where(and(...where))
    .orderBy(asc(adverts.closingAt))
    .all();
  const filtered = !!(q || dept || type || closes);

  return (
    <>
      <section className="bg-teal-dark text-white">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
          <h1 className="font-serif text-[36px] font-semibold leading-tight tracking-tight sm:text-[48px]">Careers at DU</h1>
          <p className="mt-3 max-w-[60ch] text-[17px] text-white/90">Faculty and administrative positions open now. No account is needed to browse; you&apos;ll create one to apply.</p>
        </div>
      </section>

      <section className="bg-off py-8 sm:py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <form method="get" className="grid gap-4 rounded-[10px] border border-line bg-white p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-[2fr_1.3fr_1fr_1fr_auto] lg:items-end" role="search">
            <Field label="Search" htmlFor="q">
              <Input id="q" name="q" type="search" placeholder="Title or subject" defaultValue={q} />
            </Field>
            <Field label="Department" htmlFor="dept">
              <Select id="dept" name="dept" defaultValue={dept}>
                <option value="">All departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.name} value={d.name}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category" htmlFor="type">
              <Select id="type" name="type" defaultValue={type}>
                <option value="">All</option>
                <option value="faculty">Faculty</option>
                <option value="administrative">Administrative</option>
              </Select>
            </Field>
            <Field label="Closing" htmlFor="closes">
              <Select id="closes" name="closes" defaultValue={closes}>
                <option value="">Any date</option>
                <option value="7">Within 7 days</option>
                <option value="30">Within 30 days</option>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-1">
              <Button type="submit">Search</Button>
              {filtered && (
                <ButtonLink href="/careers" variant="ghost">
                  Clear
                </ButtonLink>
              )}
            </div>
          </form>

          <p className="mt-6 text-[15px] text-muted" aria-live="polite">
            {rows.length} {rows.length === 1 ? "position" : "positions"} open{filtered ? " for these filters" : ""}
          </p>

          {rows.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title={filtered ? "No positions match these filters" : "No open positions right now"}
                action={filtered ? <ButtonLink href="/careers" variant="secondary">Show all positions</ButtonLink> : undefined}
              >
                {filtered ? "Try another department or a wider closing date." : "New positions are posted here first. Check back soon."}
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 md:grid-cols-2">
              {rows.map(({ p, a }) => (
                <li key={p.id}>
                  <LinkCard href={`/careers/${p.code}`} className="h-full">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={p.type === "faculty" ? "teal" : "sand"}>{p.type === "faculty" ? "Faculty" : "Administrative"}</Badge>
                      {p.posts > 1 && <Badge>{p.posts} vacancies</Badge>}
                    </div>
                    <h2 className="mt-3 text-xl font-semibold leading-snug">{p.title}</h2>
                    <p className="mt-1 text-[15px] text-muted">
                      {p.department} · {p.grade}
                    </p>
                    <p className="mt-3 text-[15px]">
                      Closes <span className="font-semibold">{formatDate(a.closingAt)}</span> <span className="text-muted">({relativeDays(a.closingAt)})</span>
                    </p>
                  </LinkCard>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
