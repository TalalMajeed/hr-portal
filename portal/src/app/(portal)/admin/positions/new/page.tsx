import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, DEPARTMENTS, FACULTY_RANKS, GRADES } from "@/lib/constants";
import { createPositionAction } from "@/actions/positions";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { PositionForm } from "@/components/positions/position-form";

export const metadata: Metadata = { title: "New position" };

export default async function NewPositionPage() {
  const user = await requireUser(["super_admin", "hr", "hiring_lead"]);
  const leads = (await db.select({ id: users.id, name: users.name, designation: users.designation }).from(users).where(eq(users.role, "hiring_lead")));
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Positions", href: "/admin/positions" }, { label: "New position" }]}
        title="New position request"
        description="Start with the basics. Next you'll add the ToRs, job description, eligibility criteria and rubric, then send it to HR and the ED for approval."
      />
      <Card>
        <CardBody>
          <PositionForm
            action={createPositionAction}
            departments={[...DEPARTMENTS]}
            categories={CATEGORIES}
            grades={GRADES}
            ranks={FACULTY_RANKS}
            leads={leads}
            showLead={user.role !== "hiring_lead"}
            submitLabel="Create position"
          />
        </CardBody>
      </Card>
    </>
  );
}
