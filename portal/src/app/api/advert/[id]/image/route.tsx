import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adverts, positions } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { formatDate } from "@/lib/format";

/** B5: a 1200 by 1200 image of the ad for LinkedIn and social media. Public once published. */
export async function GET(_: Request, ctx: RouteContext<"/api/advert/[id]/image">) {
  const { id } = await ctx.params;
  const p = db.select().from(positions).where(eq(positions.id, Number(id))).get();
  const ad = p && db.select().from(adverts).where(eq(adverts.positionId, p.id)).get();
  if (!p || !ad) return new Response("Not found", { status: 404 });
  const user = await getUser();
  if (ad.status !== "published" && !(user && canManagePosition(user, p))) return new Response("Not found", { status: 404 });

  const logo = await fs.readFile(path.join(process.cwd(), "public", "du-logo.png"));
  const logoSrc = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", padding: "56px 72px 36px", borderBottom: "6px solid #008080" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={330} height={115} alt="" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 72px", gap: 24 }}>
          <div style={{ fontSize: 34, color: "#008080", fontWeight: 700 }}>We are hiring</div>
          <div style={{ fontSize: 76, color: "#1f2933", fontWeight: 700, lineHeight: 1.1 }}>{p.title}</div>
          <div style={{ fontSize: 38, color: "#4b5563" }}>{`${p.department} · ${p.grade} · ${p.posts} ${p.posts === 1 ? "post" : "posts"}`}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#005c5c", color: "#ffffff", padding: "40px 72px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 30 }}>Apply online by</div>
            <div style={{ fontSize: 44, fontWeight: 700 }}>{formatDate(ad.closingAt)}</div>
          </div>
          <div style={{ fontSize: 34 }}>careers.du.edu.pk</div>
        </div>
      </div>
    ),
    { width: 1200, height: 1200 },
  );
}
