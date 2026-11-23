import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applications, documents } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { canViewApplication } from "@/lib/access";
import { readUpload } from "@/lib/uploads";
import { audit } from "@/lib/audit";

/**
 * Serves an uploaded file to someone allowed to see it: its owner, staff, and the
 * reviewers, panelists or board members who can see the application it belongs to.
 */
export async function GET(request: Request, ctx: RouteContext<"/api/files/[id]">) {
  const user = await getUser();
  if (!user) return new Response("Sign in to open this file.", { status: 401 });
  const { id } = await ctx.params;
  const doc = (await db.select().from(documents).where(eq(documents.id, Number(id))))[0];
  if (!doc) return new Response("File not found.", { status: 404 });

  let allowed = doc.ownerUserId === user.id || ["super_admin", "ed", "hr"].includes(user.role);
  if (!allowed && doc.applicationId) allowed = await canViewApplication(user, doc.applicationId);
  if (!allowed && doc.ownerUserId) {
    // A candidate's profile file: allowed if the viewer can see any application by that candidate.
    const apps = (await db.select({ id: applications.id }).from(applications).where(eq(applications.candidateId, doc.ownerUserId)));
    for (const a of apps) {
      if (await canViewApplication(user, a.id)) {
        allowed = true;
        break;
      }
    }
  }
  if (!allowed && doc.positionId) allowed = ["hiring_lead", "board"].includes(user.role);
  if (!allowed) return new Response("You don't have access to this file.", { status: 403 });

  await audit(user.id, "file_viewed", "document", doc.id, doc.filename);
  const body = await readUpload(doc.id);
  if (!body) return new Response("File not found.", { status: 404 });
  const download = new URL(request.url).searchParams.has("download");
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": doc.mime,
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${encodeURIComponent(doc.filename)}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
