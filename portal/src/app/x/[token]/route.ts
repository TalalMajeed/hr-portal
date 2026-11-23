import { NextResponse } from "next/server";
import { signInWithLink } from "@/actions/auth";
import { ROLE_HOME } from "@/lib/constants";

/** Secure link for external reviewers and panelists (no password needed). */
export async function GET(request: Request, ctx: RouteContext<"/x/[token]">) {
  const { token } = await ctx.params;
  const user = await signInWithLink(token);
  const url = new URL(user ? ROLE_HOME[user.role] : "/login?link=invalid", request.url);
  return NextResponse.redirect(url);
}
