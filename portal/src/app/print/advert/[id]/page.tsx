import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { adverts } from "@/lib/db/schema";
import { requireUser } from "@/lib/auth";
import { positionForPage } from "@/lib/access";
import { STAFF_ROLES } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { audit } from "@/lib/audit";
import { Letterhead } from "@/components/print/letterhead";

export const metadata: Metadata = { title: "Advert" };

export default async function PrintAdvert({ params }: PageProps<"/print/advert/[id]">) {
  const user = await requireUser(STAFF_ROLES);
  const p = await positionForPage(user, (await params).id);
  const ad = (await db.select().from(adverts).where(eq(adverts.positionId, p.id)))[0];
  if (!ad) notFound();
  await audit(user.id, "advert_exported", "position", p.id, "PDF");
  return (
    <Letterhead title={`Vacancy: ${p.title}`} subtitle={`${p.code} · Apply by ${formatDateTime(ad.closingAt)} PKT`} back={`/admin/positions/${p.id}/advert`}>
      <div className="whitespace-pre-line text-[16px] leading-relaxed">{ad.body}</div>
    </Letterhead>
  );
}
