import type { Metadata } from "next";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { positions } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { importCandidatesAction } from "@/actions/import";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ImportForm } from "@/components/candidate/import-form";

export const metadata: Metadata = { title: "Import candidates" };

export default async function ImportPage() {
  await requireUser(["hr", "super_admin"]);
  const list = db.select().from(positions).where(eq(positions.approvalStatus, "approved")).orderBy(desc(positions.id)).all();
  return (
    <>
      <PageHeader
        title="Import candidates"
        description="Bring existing candidates, their details and any earlier scores in from a spreadsheet. Each row becomes a submitted application on the chosen position."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Upload or paste a CSV" />
          <CardBody>
            <ImportForm action={importCandidatesAction} positions={list.map((p) => ({ id: p.id, label: `${p.code}: ${p.title}` }))} />
          </CardBody>
        </Card>
        <Card className="self-start">
          <CardHeader title="Columns" />
          <CardBody className="grid gap-3 text-[15px]">
            <p>
              <span className="font-semibold">name</span> is required. The others are optional: email, phone, cnic, degree, level (PhD, MS, BS or 1 to 6), field, institution, years,
              source (direct, agency or referral) and score.
            </p>
            <p className="text-muted">
              Files in a Google Drive folder: export the tracking sheet as CSV and import it here, then attach CVs from each application&apos;s page.
            </p>
            <p className="text-muted">Scores from an earlier process are kept as an internal note, since they used a different scale from this post&apos;s rubric.</p>
            <p className="text-muted">Rows that match an existing applicant by CNIC, email or mobile are flagged as possible duplicates.</p>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
