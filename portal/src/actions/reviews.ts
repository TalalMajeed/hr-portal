"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, reviewAssignments } from "@/lib/db/schema";
import { assertUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getDoc } from "@/lib/positions";
import { readScores } from "@/lib/scoring";
import { done, fail, num, safe, str, type ActionState } from "@/lib/action-state";

/** D4: a reviewer scores an assigned application against the shortlisting rubric. */
export async function saveReviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const user = await assertUser(["reviewer"]);
    const a = (await db.select().from(reviewAssignments).where(eq(reviewAssignments.id, num(fd, "assignmentId"))))[0];
    if (!a || a.reviewerId !== user.id) return fail("This review isn't assigned to you.");
    if (a.submittedAt) return fail("You've already submitted this review. Ask HR if something needs changing.");
    const app = (await db.select().from(applications).where(eq(applications.id, a.applicationId)))[0]!;
    const items = (await getDoc(app.positionId, "rubric"))?.shortlisting ?? [];
    const { scores, errors, complete } = readScores(fd, items);
    if (errors.length) return fail(errors.join(" "));
    const remarks = str(fd, "remarks").slice(0, 4000);
    const submit = str(fd, "intent") === "submit";
    if (submit && !complete) return fail("Score every criterion before you submit.");
    await db.update(reviewAssignments)
      .set({ scores, remarks, submittedAt: submit ? new Date().toISOString() : null })
      .where(eq(reviewAssignments.id, a.id))
      ;
    await audit(user.id, submit ? "review_submitted" : "review_saved", "application", a.applicationId, JSON.stringify(scores));
    revalidatePath("/review");
    revalidatePath(`/review/${a.id}`);
    revalidatePath(`/admin/applications/${a.applicationId}`);
    revalidatePath(`/admin/positions/${app.positionId}/applications`);
    return done(submit ? "Review submitted. Thank you." : "Draft saved.");
  });
}
