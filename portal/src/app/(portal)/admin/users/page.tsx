import type { Metadata } from "next";
import Form from "next/form";
import { and, asc, eq, ilike, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, type Role } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { appUrl } from "@/lib/email";
import { ROLE_LABELS } from "@/lib/constants";
import { formatShortDate } from "@/lib/format";
import { createUserAction, updateUserAction } from "@/actions/admin";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ActionForm } from "@/components/ui/action-form";
import { Checkbox, Field, FormGrid, Input, Select } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { CopyLink } from "@/components/admin/copy-link";

export const metadata: Metadata = { title: "Users and roles" };

const PERMISSIONS: [string, Role[]][] = [
  ["Users, roles, settings, templates, audit log", ["super_admin"]],
  ["Approve positions, ads, shortlists and panels; sign off reports", ["ed", "super_admin"]],
  ["See every position and dashboard", ["ed", "hr", "super_admin"]],
  ["Create positions, post ads, screen, schedule, send emails", ["hr", "super_admin"]],
  ["Draft ToRs and JD, propose shortlist and panel, review evaluations", ["hiring_lead", "hr", "super_admin"]],
  ["Score assigned applications", ["reviewer"]],
  ["Mark availability, view assigned candidates, submit evaluations", ["panel"]],
  ["Read Board packs (read only)", ["board"]],
  ["Upload sourced candidates to a position", ["agency"]],
];

const ROLES: Role[] = ["super_admin", "ed", "hr", "hiring_lead", "reviewer", "panel", "board", "agency"];

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const me = await requireUser(["super_admin", "hr"]);
  const assignable: Role[] = me.role === "super_admin" ? ROLES : ["hiring_lead", "reviewer", "panel", "board", "agency"];
  const sp = await searchParams;
  const role = typeof sp.role === "string" ? sp.role : "";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const where: SQL[] = [ne(users.role, "candidate")];
  if (role) where.push(eq(users.role, role as Role));
  if (q) where.push(or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`), ilike(users.organisation, `%${q}%`))!);
  const rows = (await db.select().from(users).where(and(...where)).orderBy(asc(users.role), asc(users.name)));

  return (
    <>
      <PageHeader title="Users and roles" description="Staff, reviewers, panel members, Board members and agencies. Candidates register themselves." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid min-w-0 content-start gap-4">
          <Form action="/admin/users" className="grid gap-3 rounded-[10px] border border-line bg-white p-4 sm:grid-cols-[2fr_1fr_auto]">
            <Input name="q" defaultValue={q} placeholder="Search name, email or organisation" aria-label="Search" />
            <Select name="role" defaultValue={role} aria-label="Role">
              <option value="">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </Select>
            <Button type="submit" variant="secondary">
              Filter
            </Button>
          </Form>
          <Table>
            <THead>
              <tr>
                <TH>Person</TH>
                <TH>Role</TH>
                <TH>Access</TH>
                <TH>
                  <span className="sr-only">Actions</span>
                </TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((u) => {
                const editable = assignable.includes(u.role) && u.id !== me.id;
                return (
                  <TR key={u.id}>
                    <TD className="min-w-56">
                      <p className="font-semibold">{u.name}</p>
                      <p className="text-sm text-muted">{u.email}</p>
                      <p className="text-sm text-muted">{[u.designation, u.organisation].filter(Boolean).join(", ")}</p>
                    </TD>
                    <TD className="min-w-44">
                      {editable ? (
                        <ActionForm action={updateUserAction} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={u.id} />
                          <input type="hidden" name="step" value="role" />
                          <Select name="role" defaultValue={u.role} aria-label={`Role for ${u.name}`} className="h-9">
                            {assignable.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </Select>
                          <SubmitButton size="sm" variant="ghost" pendingText="…">
                            Save
                          </SubmitButton>
                        </ActionForm>
                      ) : (
                        ROLE_LABELS[u.role]
                      )}
                    </TD>
                    <TD className="min-w-48">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge tone={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Deactivated"}</Badge>
                        {u.external && <Badge tone="sand">External, secure link</Badge>}
                        {u.twoFactorEnabled && <Badge tone="teal">Two-step</Badge>}
                      </div>
                      {u.external && u.accessToken && <CopyLink url={appUrl(`/x/${u.accessToken}`)} />}
                      <p className="mt-1 text-sm text-muted">Since {formatShortDate(u.createdAt)}</p>
                    </TD>
                    <TD>
                      {editable && (
                        <ActionForm action={updateUserAction} className="flex flex-wrap gap-2">
                          <input type="hidden" name="userId" value={u.id} />
                          {u.external ? (
                            <SubmitButton name="step" value="link" size="sm" variant="secondary">
                              New link
                            </SubmitButton>
                          ) : (
                            <SubmitButton name="step" value="reset" size="sm" variant="secondary">
                              Reset password
                            </SubmitButton>
                          )}
                          <ConfirmButton name="step" value="toggle" variant={u.active ? "danger" : "primary"} question={u.active ? "Deactivate?" : "Activate?"} confirmText="Yes">
                            {u.active ? "Deactivate" : "Activate"}
                          </ConfirmButton>
                        </ActionForm>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader title="Add a user" />
            <CardBody>
              <ActionForm action={createUserAction} className="grid gap-4" resetOnSuccess>
                <Field label="Full name" htmlFor="u-name" required>
                  <Input id="u-name" name="name" required />
                </Field>
                <Field label="Email" htmlFor="u-email" required>
                  <Input id="u-email" name="email" type="email" required />
                </Field>
                <Field label="Role" htmlFor="u-role" required>
                  <Select id="u-role" name="role" defaultValue="hiring_lead">
                    {assignable.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <FormGrid>
                  <Field label="Designation" htmlFor="u-des">
                    <Input id="u-des" name="designation" />
                  </Field>
                  <Field label="Organisation" htmlFor="u-org">
                    <Input id="u-org" name="organisation" />
                  </Field>
                  <Field label="Phone" htmlFor="u-phone">
                    <Input id="u-phone" name="phone" type="tel" />
                  </Field>
                  <Field label="Discipline" htmlFor="u-disc">
                    <Input id="u-disc" name="discipline" />
                  </Field>
                </FormGrid>
                <Checkbox name="external" label="External reviewer or panelist" hint="Works through a secure link without a password" />
                <div>
                  <SubmitButton>Add user</SubmitButton>
                </div>
              </ActionForm>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="What each role can do" />
            <CardBody>
              <ul className="grid gap-3 text-[15px]">
                {PERMISSIONS.map(([what, roles]) => (
                  <li key={what}>
                    <p>{what}</p>
                    <p className="text-sm text-muted">{roles.map((r) => ROLE_LABELS[r]).join(", ")}</p>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
