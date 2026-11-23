import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { authSessions, users, type Role } from "@/lib/db/schema";
import { ROLE_HOME } from "@/lib/constants";

const COOKIE = "du_session";
const SESSION_DAYS = 7;

export type SessionUser = typeof users.$inferSelect;

export function hashPassword(password: string) {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string | null) {
  return !!hash && bcrypt.compareSync(password, hash);
}

export function newToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}

export function newCode() {
  return String(randomInt(100000, 1000000));
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Starts a session. When `pendingCode` is set the session is only good for the second-factor step. */
export async function createSession(userId: number, pendingCode?: string) {
  const token = newToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.insert(authSessions)
    .values({ id: hashToken(token), userId, expiresAt, pendingCode: pendingCode ? hashToken(pendingCode) : null })
    .run();
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

async function readSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const row = db
    .select({ session: authSessions, user: users })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(eq(authSessions.id, hashToken(token)), gt(authSessions.expiresAt, new Date().toISOString())))
    .get();
  if (!row || !row.user.active) return null;
  return row;
}

/** The signed-in user, or null. Sessions still waiting for a second-factor code don't count. */
export const getUser = cache(async (): Promise<SessionUser | null> => {
  const row = await readSession();
  if (!row || row.session.pendingCode) return null;
  return row.user;
});

/** The user behind a session that still needs its second-factor code. */
export async function getPendingUser() {
  const row = await readSession();
  if (!row || !row.session.pendingCode) return null;
  return row;
}

export async function confirmSecondFactor(code: string) {
  const row = await getPendingUser();
  if (!row) return false;
  if (row.session.pendingCode !== hashToken(code.trim())) return false;
  db.update(authSessions).set({ pendingCode: null }).where(eq(authSessions.id, row.session.id)).run();
  return true;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) db.delete(authSessions).where(eq(authSessions.id, hashToken(token))).run();
  jar.delete(COOKIE);
}

/** For pages: redirects to sign-in, or to the user's own home if their role isn't allowed. */
export async function requireUser(roles?: Role[]) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) redirect(ROLE_HOME[user.role]);
  return user;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function assertUser(roles?: Role[]) {
  const user = await getUser();
  if (!user) throw new Error("You need to sign in again.");
  if (roles && !roles.includes(user.role)) throw new Error("You don't have permission to do that.");
  return user;
}

export function hasRole(user: Pick<SessionUser, "role"> | null | undefined, ...roles: Role[]) {
  return !!user && roles.includes(user.role);
}
