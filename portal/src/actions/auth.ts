"use server";

import { redirect } from "next/navigation";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { candidateProfiles, users } from "@/lib/db/schema";
import {
  assertUser,
  confirmSecondFactor,
  createSession,
  destroySession,
  getPendingUser,
  hashPassword,
  newCode,
  newToken,
  verifyPassword,
} from "@/lib/auth";
import { audit } from "@/lib/audit";
import { appUrl, mailConfigured, sendTemplate } from "@/lib/email";
import { ROLE_HOME, STAFF_ROLES } from "@/lib/constants";
import { done, fail, str, type ActionState } from "@/lib/action-state";

function safeNext(next: string, fallback: string) {
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

/** Failed sign-ins per email in the last 15 minutes, to slow down password guessing. */
const failures = new Map<string, number[]>();
const WINDOW = 15 * 60_000;

export async function signInAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  const recent = (failures.get(email) ?? []).filter((t) => Date.now() - t < WINDOW);
  if (recent.length >= 5) return fail("Too many attempts. Wait 15 minutes, or reset your password.");
  const user = (await db.select().from(users).where(eq(users.email, email)))[0];
  if (!user || !verifyPassword(password, user.passwordHash) || !user.active) {
    failures.set(email, [...recent, Date.now()]);
    await audit(user?.id, "sign_in_failed", "user", user?.id, email);
    return fail("That email and password don't match an account.");
  }
  failures.delete(email);
  if (!user.emailVerified) {
    return fail("Verify your email first. We sent a link when you registered; you can send a new one from the sign-in page.");
  }
  // Two-step sign-in needs real email; without it the code could never arrive.
  if (user.twoFactorEnabled && STAFF_ROLES.includes(user.role) && mailConfigured()) {
    const code = newCode();
    await createSession(user.id, code);
    await sendTemplate("two_factor_code", { email: user.email, userId: user.id }, { name: user.name, code });
    await audit(user.id, "two_factor_sent", "user", user.id);
    redirect(`/login/verify?next=${encodeURIComponent(str(fd, "next"))}`);
  }
  await createSession(user.id);
  await audit(user.id, "sign_in", "user", user.id);
  redirect(safeNext(str(fd, "next"), ROLE_HOME[user.role]));
}

export async function verifySecondFactorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const pending = await getPendingUser();
  if (!pending) redirect("/login");
  const ok = await confirmSecondFactor(str(fd, "code"));
  if (!ok) {
    await audit(pending.user.id, "two_factor_failed", "user", pending.user.id);
    return fail("That code isn't right. Check the latest email and try again.");
  }
  await audit(pending.user.id, "sign_in", "user", pending.user.id, "with second factor");
  redirect(safeNext(str(fd, "next"), ROLE_HOME[pending.user.role]));
}

const registerSchema = z.object({
  name: z.string().min(2, "Enter your full name."),
  email: z.email("Enter a valid email address."),
  phone: z.string().regex(/^\+?[0-9 ()-]{7,20}$/, "Enter a mobile number with country code, such as +92 300 1234567."),
  password: z.string().min(8, "Use at least 8 characters."),
});

export async function registerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse({
    name: str(fd, "name"),
    email: str(fd, "email").toLowerCase(),
    phone: str(fd, "phone"),
    password: str(fd, "password"),
  });
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return fail("Check the highlighted fields.", fieldErrors);
  }
  if (str(fd, "password") !== str(fd, "confirm")) return fail("The passwords don't match.", { confirm: "The passwords don't match." });
  const { name, email, phone, password } = parsed.data;
  if ((await db.select().from(users).where(eq(users.email, email)))[0]) {
    return fail("An account with this email already exists. Sign in or reset your password.");
  }
  const verifyToken = newToken();
  const user = (await db
    .insert(users)
    .values({ name, email, phone, role: "candidate", passwordHash: hashPassword(password), verifyToken })
    .returning()
    )[0];
  await db.insert(candidateProfiles)
    .values({ userId: user.id, country: str(fd, "country") || "Pakistan", timezone: str(fd, "timezone") || "Asia/Karachi" })
    ;
  await sendTemplate("verify_email", { email, userId: user.id }, { name, link: appUrl(`/verify?token=${verifyToken}`) });
  await audit(user.id, "registered", "user", user.id);
  redirect(`/register/check-email?email=${encodeURIComponent(email)}`);
}

export async function verifyEmail(token: string) {
  if (!token) return false;
  const user = (await db.select().from(users).where(eq(users.verifyToken, token)))[0];
  if (!user) return false;
  await db.update(users).set({ emailVerified: true, verifyToken: null }).where(eq(users.id, user.id));
  await audit(user.id, "email_verified", "user", user.id);
  return true;
}

export async function resendVerificationAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const user = (await db.select().from(users).where(eq(users.email, email)))[0];
  if (user && !user.emailVerified) {
    const token = newToken();
    await db.update(users).set({ verifyToken: token }).where(eq(users.id, user.id));
    await sendTemplate("verify_email", { email, userId: user.id }, { name: user.name, link: appUrl(`/verify?token=${token}`) });
  }
  return done("If that account still needs verifying, a new link is on its way.");
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const email = str(fd, "email").toLowerCase();
  const user = (await db.select().from(users).where(eq(users.email, email)))[0];
  if (user && user.passwordHash) {
    const token = newToken();
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.update(users).set({ resetToken: token, resetExpires: expires }).where(eq(users.id, user.id));
    await sendTemplate("password_reset", { email, userId: user.id }, { name: user.name, link: appUrl(`/reset?token=${token}`) });
    await audit(user.id, "password_reset_requested", "user", user.id);
  }
  return done("If an account uses that email, we've sent a reset link. It works for one hour.");
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const token = str(fd, "token");
  const password = str(fd, "password");
  if (password.length < 8) return fail("Use at least 8 characters.");
  if (password !== str(fd, "confirm")) return fail("The passwords don't match.");
  const user = (await db
    .select()
    .from(users)
    .where(and(eq(users.resetToken, token), gt(users.resetExpires, new Date().toISOString())))
    )[0];
  if (!user) return fail("This reset link has expired. Ask for a new one.");
  await db.update(users)
    .set({ passwordHash: hashPassword(password), resetToken: null, resetExpires: null, emailVerified: true })
    .where(eq(users.id, user.id))
    ;
  await audit(user.id, "password_reset", "user", user.id);
  redirect("/login?reset=1");
}

/** Secure link for external reviewers and panelists: signs them in without a password. */
export async function signInWithLink(token: string) {
  if (!token || token.length < 20) return null;
  const user = (await db.select().from(users).where(and(eq(users.accessToken, token), eq(users.active, true))))[0];
  if (!user) return null;
  await createSession(user.id);
  await audit(user.id, "sign_in", "user", user.id, "secure link");
  return user;
}

export async function signOutAction() {
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await assertUser();
  if (user.passwordHash && !verifyPassword(str(fd, "current"), user.passwordHash)) return fail("Your current password isn't right.");
  const password = str(fd, "password");
  if (password.length < 8) return fail("Use at least 8 characters.");
  if (password !== str(fd, "confirm")) return fail("The new passwords don't match.");
  await db.update(users).set({ passwordHash: hashPassword(password) }).where(eq(users.id, user.id));
  await audit(user.id, "password_changed", "user", user.id);
  return done("Password changed.");
}

export async function toggleTwoFactorAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await assertUser(STAFF_ROLES);
  const enable = str(fd, "enable") === "1";
  if (enable && !mailConfigured()) return fail("Two-step sign-in needs email delivery. Ask IT to connect the mail service first.");
  await db.update(users).set({ twoFactorEnabled: enable }).where(eq(users.id, user.id));
  await audit(user.id, enable ? "two_factor_enabled" : "two_factor_disabled", "user", user.id);
  return done(enable ? "Two-step sign-in is on. Next time you sign in, we'll email you a code." : "Two-step sign-in is off.");
}
