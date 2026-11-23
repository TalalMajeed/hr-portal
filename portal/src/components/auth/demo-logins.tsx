import { asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ROLE_LABELS } from "@/lib/constants";
import { demoSignInAction } from "@/actions/auth";

const DEMO_EMAILS = [
  "admin@demo.du.edu.pk",
  "ed@demo.du.edu.pk",
  "azhar.hr@demo.du.edu.pk",
  "dean.science@demo.du.edu.pk",
  "reviewer.ext@example.com",
  "panel.chair@demo.du.edu.pk",
  "board.chair@demo.du.edu.pk",
  "careerpakistan@example.com",
  "ayesha.khan@example.com",
];

/** Seeded accounts for judges to try each role. Hidden when DEMO_LOGINS=off. */
export function DemoLogins() {
  if (process.env.DEMO_LOGINS === "off") return null;
  const rows = db.select().from(users).where(inArray(users.email, DEMO_EMAILS)).orderBy(asc(users.id)).all();
  if (!rows.length) return null;
  return (
    <div className="mt-8 border-t border-line pt-6">
      <h2 className="text-base font-semibold">Try a demo account</h2>
      <p className="mt-1 text-[15px] text-muted">Sample data only. Every account&apos;s password is Demo@1234.</p>
      <ul className="mt-3 grid gap-2">
        {rows.map((u) => (
          <li key={u.id}>
            <form action={demoSignInAction}>
              <input type="hidden" name="email" value={u.email} />
              <button
                type="submit"
                className="flex w-full items-center justify-between gap-3 rounded-[4px] border border-line bg-white px-3 py-2.5 text-left transition-colors duration-150 hover:border-teal hover:bg-tint"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">{u.name}</span>
                  <span className="block truncate text-sm text-muted">{u.email}</span>
                </span>
                <span className="shrink-0 text-sm font-medium text-teal">{ROLE_LABELS[u.role]}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  );
}
