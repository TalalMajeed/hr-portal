import type { Metadata } from "next";
import Link from "next/link";
import { asc, inArray } from "drizzle-orm";
import { FileDown, FileSpreadsheet, Printer } from "lucide-react";
import { db } from "@/lib/db";
import { positions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { visiblePositionIds } from "@/lib/access";
import { REPORTS } from "@/lib/reports";
import { STAFF_ROLES } from "@/lib/constants";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonAnchor, Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { ReportTableView } from "@/components/reports/report-table";
import { cn } from "@/components/ui/cn";

export const metadata: Metadata = { title: "Reports" };

const ORDER = ["summary", "pipeline", "hr", "time", "source", "panel", "applicants"];
const SHORT: Record<string, string> = {
  summary: "Summary per post",
  pipeline: "Pipeline",
  hr: "HR summary",
  time: "Time to hire",
  source: "Sources and agencies",
  panel: "Panel activity",
  applicants: "Applicant profile",
};

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const user = await requireUser(STAFF_ROLES);
  const sp = await searchParams;
  const key = typeof sp.r === "string" && REPORTS[sp.r] ? sp.r : "summary";
  const scope = await visiblePositionIds(user);
  const table = await REPORTS[key](scope);
  const posList = (await db
    .select({ id: positions.id, code: positions.code, title: positions.title })
    .from(positions)
    .where(scope ? inArray(positions.id, scope.length ? scope : [-1]) : undefined)
    .orderBy(asc(positions.code))
    );

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every report exports to Excel, CSV and a print-ready PDF in DU format."
        actions={
          ["super_admin", "ed"].includes(user.role) && (
            <ButtonAnchor href="/api/export/all" variant="secondary">
              <FileDown aria-hidden /> Export all data
            </ButtonAnchor>
          )
        }
      />
      <nav aria-label="Reports" className="-mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-2">
          {ORDER.map((k) => (
            <li key={k}>
              <Link
                href={`/admin/reports?r=${k}`}
                aria-current={k === key ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center rounded-[4px] border px-3 text-[15px] font-semibold no-underline transition-colors duration-150",
                  k === key ? "border-teal bg-tint text-teal-dark" : "border-line bg-white text-ink hover:border-teal",
                )}
              >
                {SHORT[k]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <Card>
        <CardHeader
          title={table.title}
          description={table.description}
          actions={
            <>
              <ButtonAnchor href={`/api/export/${key}`} size="sm" variant="secondary">
                <FileSpreadsheet aria-hidden /> Excel
              </ButtonAnchor>
              <ButtonAnchor href={`/api/export/${key}?format=csv`} size="sm" variant="secondary">
                CSV
              </ButtonAnchor>
              <ButtonAnchor href={`/print/reports/${key}`} target="_blank" size="sm" variant="secondary">
                <Printer aria-hidden /> PDF
              </ButtonAnchor>
            </>
          }
        />
        <CardBody>
          <ReportTableView table={table} />
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Applications of a post" description="Every application with its status, for any position." />
        <CardBody>
          <form action="/api/export/applications" method="get" className="flex flex-wrap items-end gap-3">
            <Field label="Position" htmlFor="position" className="min-w-64 flex-1">
              <Select id="position" name="position" required defaultValue="">
                <option value="" disabled>
                  Choose a position
                </option>
                {posList.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} {p.title}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Format" htmlFor="format">
              <Select id="format" name="format" defaultValue="xlsx">
                <option value="xlsx">Excel</option>
                <option value="csv">CSV</option>
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              <FileDown aria-hidden /> Download
            </Button>
          </form>
        </CardBody>
      </Card>
    </>
  );
}
