import type { Metadata } from "next";
import { db } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { saveSettingsAction } from "@/actions/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Field, FormGrid, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonAnchor } from "@/components/ui/button";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser(["super_admin"]);
  const s = Object.fromEntries(db.select().from(settings).all().map((r) => [r.key, r.value]));
  const zoom = !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Uploads, email and data" />
          <CardBody>
            <ActionForm action={saveSettingsAction} className="grid gap-4">
              <FormGrid>
                <Field label="Largest upload (MB)" htmlFor="max_upload_mb" hint="PDF, JPG and PNG only">
                  <Input id="max_upload_mb" name="max_upload_mb" type="number" inputMode="numeric" min={1} max={20} defaultValue={s.max_upload_mb ?? "5"} />
                </Field>
                <Field label="Keep candidate data for (months)" htmlFor="retention_months" hint="DU's retention policy">
                  <Input id="retention_months" name="retention_months" type="number" inputMode="numeric" min={6} max={120} defaultValue={s.retention_months ?? "24"} />
                </Field>
              </FormGrid>
              <Field label="Send emails from" htmlFor="from_address">
                <Input id="from_address" name="from_address" type="email" defaultValue={s.from_address ?? "careers@du.edu.pk"} />
              </Field>
              <div>
                <SubmitButton>Save settings</SubmitButton>
              </div>
            </ActionForm>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Integrations" />
          <CardBody className="grid gap-4 text-[15px]">
            <div>
              <p className="font-semibold">Zoom</p>
              <p className="text-muted">
                {zoom
                  ? "Connected. Meetings are created with the waiting room on."
                  : "Not connected. Meeting links are simulated. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET to create real meetings."}
              </p>
            </div>
            <div>
              <p className="font-semibold">Calendar invites</p>
              <p className="text-muted">Confirmed sessions download as calendar files that open in Google Calendar and Outlook, and update when rescheduled.</p>
            </div>
            <div>
              <p className="font-semibold">Email</p>
              <p className="text-muted">Emails are kept in the portal record. Connect DU&apos;s mail server to deliver them.</p>
            </div>
            <div>
              <p className="font-semibold">Your data</p>
              <p className="text-muted">DU owns every record and can export all of it at any time.</p>
              <ButtonAnchor href="/api/export/all" variant="secondary" size="sm" className="mt-2">
                Export all data to Excel
              </ButtonAnchor>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
