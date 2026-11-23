"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { emailTemplates, jdTemplates, settings, users, type JdContent, type Role } from "@/lib/db/schema";
import { assertUser, newToken } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appUrl, sendTemplate } from "@/lib/email";
import { done, fail, lines, num, safe, str, type ActionState } from "@/lib/action-state";

const ASSIGNABLE: Record<"super_admin" | "hr", Role[]> = {
  super_admin: ["super_admin", "ed", "hr", "hiring_lead", "reviewer", "panel", "board", "agency"],
  hr: ["hiring_lead", "reviewer", "panel", "board", "agency"],
};

const userSchema = z.object({
  name: z.string().min(2, "Enter the full name."),
  email: z.email("Enter a valid email."),
  role: z.string(),
});

/** I10: HR and the super admin add user accounts. External reviewers and panelists get a secure link instead of a password. */
export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const me = await assertUser(["super_admin", "hr"]);
    const parsed = userSchema.safeParse({ name: str(fd, "name"), email: str(fd, "email").toLowerCase(), role: str(fd, "role") });
    if (!parsed.success) return fail(parsed.error.issues[0].message);
    const role = parsed.data.role as Role;
    if (!ASSIGNABLE[me.role as "super_admin" | "hr"].includes(role)) return fail("You can't create that kind of account.");
    if (db.select().from(users).where(eq(users.email, parsed.data.email)).get()) return fail("An account with that email already exists.");
    const external = str(fd, "external") === "on" && ["reviewer", "panel"].includes(role);
    const resetToken = external ? null : newToken();
    const u = db
      .insert(users)
      .values({
        name: parsed.data.name,
        email: parsed.data.email,
        role,
        phone: str(fd, "phone"),
        designation: str(fd, "designation"),
        organisation: str(fd, "organisation") || (external ? "" : "Daanish University"),
        department: str(fd, "department"),
        discipline: str(fd, "discipline"),
        external,
        accessToken: external ? newToken(24) : null,
        emailVerified: true,
        resetToken,
        resetExpires: resetToken ? new Date(Date.now() + 7 * 86_400_000).toISOString() : null,
      })
      .returning()
      .get();
    if (resetToken) {
      sendTemplate("password_reset", { email: u.email, userId: u.id }, { name: u.name, link: appUrl(`/reset?token=${resetToken}`) });
    }
    audit(me.id, "user_created", "user", u.id, `${u.email} as ${role}${external ? " (external)" : ""}`);
    revalidatePath("/admin/users");
    return done(external ? `${u.name} added. Copy their secure link from the list.` : `${u.name} added. We emailed them a link to set their password.`);
  });
}

export async function updateUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const me = await assertUser(["super_admin", "hr"]);
    const target = db.select().from(users).where(eq(users.id, num(fd, "userId"))).get();
    if (!target || target.role === "candidate") return fail("User not found.");
    const allowed = ASSIGNABLE[me.role as "super_admin" | "hr"];
    if (!allowed.includes(target.role)) return fail("You can't change this account.");
    const step = str(fd, "step");
    if (step === "role") {
      const role = str(fd, "role") as Role;
      if (!allowed.includes(role)) return fail("You can't give that role.");
      if (target.id === me.id) return fail("You can't change your own role.");
      db.update(users).set({ role }).where(eq(users.id, target.id)).run();
      audit(me.id, "role_changed", "user", target.id, `${target.role} to ${role}`);
    } else if (step === "toggle") {
      if (target.id === me.id) return fail("You can't deactivate yourself.");
      db.update(users).set({ active: !target.active }).where(eq(users.id, target.id)).run();
      audit(me.id, target.active ? "user_deactivated" : "user_activated", "user", target.id);
    } else if (step === "link") {
      db.update(users).set({ accessToken: newToken(24) }).where(eq(users.id, target.id)).run();
      audit(me.id, "secure_link_reissued", "user", target.id);
    } else if (step === "reset") {
      const token = newToken();
      db.update(users).set({ resetToken: token, resetExpires: new Date(Date.now() + 86_400_000).toISOString() }).where(eq(users.id, target.id)).run();
      sendTemplate("password_reset", { email: target.email, userId: target.id }, { name: target.name, link: appUrl(`/reset?token=${token}`) });
      audit(me.id, "password_reset_sent", "user", target.id);
    } else return fail("Unknown action.");
    revalidatePath("/admin/users");
    return done({ role: "Role changed.", toggle: target.active ? "Account deactivated." : "Account activated.", link: "New secure link issued. The old one no longer works.", reset: "Password reset email sent." }[step]);
  });
}

/** HR edits the text of every automatic email. */
export async function saveEmailTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const me = await assertUser(["super_admin", "hr"]);
    const key = str(fd, "key");
    const subject = str(fd, "subject");
    const body = str(fd, "body");
    if (!subject || body.length < 10) return fail("The subject and body can't be empty.");
    db.update(emailTemplates).set({ subject, body, updatedAt: new Date().toISOString() }).where(eq(emailTemplates.key, key)).run();
    audit(me.id, "email_template_saved", "email_template", null, key);
    revalidatePath("/admin/templates");
    return done("Template saved.");
  });
}

/** A4: JD templates for the job description builder. */
export async function saveJdTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const me = await assertUser(["super_admin", "hr"]);
    const name = str(fd, "name");
    if (!name) return fail("Name the template.");
    const content: JdContent = {
      summary: str(fd, "summary"),
      duties: lines(fd, "duties"),
      requiredQualifications: lines(fd, "requiredQualifications"),
      preferredQualifications: lines(fd, "preferredQualifications"),
      experience: str(fd, "experience"),
      skills: lines(fd, "skills"),
      requiredDocuments: fd.getAll("requiredDocuments").map(String),
    };
    const type = str(fd, "type") === "faculty" ? "faculty" : "administrative";
    const id = num(fd, "templateId");
    if (id) db.update(jdTemplates).set({ name, type, content }).where(eq(jdTemplates.id, id)).run();
    else db.insert(jdTemplates).values({ name, type, content }).run();
    audit(me.id, "jd_template_saved", "jd_template", id || null, name);
    revalidatePath("/admin/templates");
    return done("JD template saved.");
  });
}

export async function deleteJdTemplateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const me = await assertUser(["super_admin", "hr"]);
    const id = num(fd, "templateId");
    db.delete(jdTemplates).where(eq(jdTemplates.id, id)).run();
    audit(me.id, "jd_template_deleted", "jd_template", id);
    revalidatePath("/admin/templates");
    return done("Template deleted.");
  });
}

export async function saveSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return safe(async () => {
    const me = await assertUser(["super_admin"]);
    const mb = num(fd, "max_upload_mb");
    if (mb < 1 || mb > 20) return fail("The upload limit must be between 1 and 20 MB.");
    const months = num(fd, "retention_months");
    if (months < 6 || months > 120) return fail("Keep data for between 6 and 120 months.");
    const values = { max_upload_mb: String(mb), retention_months: String(months), from_address: str(fd, "from_address") || "careers@du.edu.pk" };
    for (const [key, value] of Object.entries(values)) {
      db.insert(settings).values({ key, value }).onConflictDoUpdate({ target: settings.key, set: { value } }).run();
    }
    audit(me.id, "settings_saved", "settings", null, JSON.stringify(values));
    revalidatePath("/admin/settings");
    return done("Settings saved.");
  });
}
