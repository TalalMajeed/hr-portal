import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { ROLE_LABELS, STAFF_ROLES } from "@/lib/constants";
import { changePasswordAction, toggleTwoFactorAction } from "@/actions/auth";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Detail, DetailGrid, Field, Input } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser();
  const isStaff = STAFF_ROLES.includes(user.role);
  return (
    <>
      <PageHeader title="My account" />
      <div className="grid gap-6">
        <Card>
          <CardHeader title="Details" />
          <CardBody>
            <DetailGrid>
              <Detail label="Name">{user.name}</Detail>
              <Detail label="Email">{user.email}</Detail>
              <Detail label="Role">{ROLE_LABELS[user.role]}</Detail>
              {user.phone && <Detail label="Phone">{user.phone}</Detail>}
              {user.organisation && <Detail label="Organisation">{user.organisation}</Detail>}
              {user.designation && <Detail label="Designation">{user.designation}</Detail>}
            </DetailGrid>
          </CardBody>
        </Card>

        {isStaff && (
          <Card>
            <CardHeader
              title="Two-step sign-in"
              description="Staff accounts can ask for an emailed code at every sign-in."
              actions={<Badge tone={user.twoFactorEnabled ? "success" : "neutral"}>{user.twoFactorEnabled ? "On" : "Off"}</Badge>}
            />
            <CardBody>
              <ActionForm action={toggleTwoFactorAction}>
                <input type="hidden" name="enable" value={user.twoFactorEnabled ? "0" : "1"} />
                <SubmitButton variant={user.twoFactorEnabled ? "secondary" : "primary"}>
                  {user.twoFactorEnabled ? "Turn off two-step sign-in" : "Turn on two-step sign-in"}
                </SubmitButton>
              </ActionForm>
            </CardBody>
          </Card>
        )}

        {!user.external && (
          <Card>
            <CardHeader title="Change password" />
            <CardBody>
              <ActionForm action={changePasswordAction} className="grid max-w-md gap-4" resetOnSuccess>
                {user.passwordHash && (
                  <Field label="Current password" htmlFor="current">
                    <Input id="current" name="current" type="password" autoComplete="current-password" required />
                  </Field>
                )}
                <Field label="New password" htmlFor="password" hint="At least 8 characters">
                  <Input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
                </Field>
                <Field label="Confirm new password" htmlFor="confirm">
                  <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
                </Field>
                <div>
                  <SubmitButton>Change password</SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
