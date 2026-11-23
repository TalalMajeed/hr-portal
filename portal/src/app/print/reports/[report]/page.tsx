import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { visiblePositionIds } from "@/lib/access";
import { REPORTS } from "@/lib/reports";
import { STAFF_ROLES } from "@/lib/constants";
import { audit } from "@/lib/audit";
import { Letterhead } from "@/components/print/letterhead";
import { ReportTableView } from "@/components/reports/report-table";

export const metadata: Metadata = { title: "Report" };

export default async function PrintReport({ params }: PageProps<"/print/reports/[report]">) {
  const user = await requireUser(STAFF_ROLES);
  const { report } = await params;
  if (!REPORTS[report]) notFound();
  const table = await REPORTS[report](await visiblePositionIds(user));
  await audit(user.id, "exported", "report", null, `${report}.pdf`);
  return (
    <Letterhead title={table.title} subtitle={table.description} back={`/admin/reports?r=${report}`}>
      <ReportTableView table={table} compact />
    </Letterhead>
  );
}
