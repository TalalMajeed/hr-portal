"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts } from "@/lib/db/schema";
import { assertUser } from "@/lib/auth";
import { advertIsOpen } from "@/lib/candidate";
import { createSourcedApplication } from "@/lib/candidate-intake";
import { isFile } from "@/lib/uploads";
import { done, fail, num, safe, str, type ActionState } from "@/lib/action-state";

/** B6: an agency uploads a sourced candidate and CV against an open position. */
export async function uploadAgencyCandidateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const agency = await assertUser(["agency"]);
    const positionId = Number(str(fd, "positionId"));
    const advert = db.select().from(adverts).where(eq(adverts.positionId, positionId)).get();
    if (!advertIsOpen(advert)) return fail("This position is closed to new candidates.");
    const name = str(fd, "name");
    const phone = str(fd, "phone");
    const cnic = str(fd, "cnic");
    const email = str(fd, "email");
    const errors: Record<string, string> = {};
    if (name.length < 2) errors.name = "Enter the candidate's full name.";
    if (!/^\+?[0-9 ()-]{7,20}$/.test(phone)) errors.phone = "Enter a mobile number with country code.";
    if (cnic && !/^\d{5}-?\d{7}-?\d$/.test(cnic)) errors.cnic = "Enter the CNIC as 12345-1234567-1.";
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = "Enter a valid email or leave it blank.";
    const cv = fd.get("cv");
    if (!isFile(cv)) errors.cv = "Attach the candidate's CV.";
    if (Object.keys(errors).length) return fail("Check the highlighted fields.", errors);

    const r = await createSourcedApplication({
      positionId,
      name,
      email,
      phone,
      cnic,
      level: str(fd, "level") || "4",
      degree: str(fd, "degree"),
      field: str(fd, "field"),
      institution: str(fd, "institution"),
      years: Math.max(0, Math.min(50, num(fd, "years"))),
      source: "agency",
      agencyId: agency.id,
      actorId: agency.id,
      cv: cv as File,
    });
    if (!r.ok) return fail(r.error);
    revalidatePath(`/agency/${positionId}`);
    revalidatePath("/agency");
    return done(
      r.duplicateOf
        ? `${name} added as ${r.appNo}. They may have applied already (${r.duplicateOf}), so HR will check for a duplicate.`
        : `${name} added as ${r.appNo}.`,
    );
  });
}
