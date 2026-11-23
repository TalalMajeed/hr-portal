import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FileDown } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getBoardPack } from "@/lib/board";
import { audit } from "@/lib/audit";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { ButtonAnchor } from "@/components/ui/button";
import { BoardPackView } from "@/components/board/board-pack";

export const metadata: Metadata = { title: "Board pack" };

export default async function BoardPackPage({ params }: PageProps<"/board/[positionId]">) {
  const user = await requireUser(["board", "super_admin"]);
  const pack = getBoardPack(Number((await params).positionId));
  if (!pack || pack.position.stage !== 10 || !pack.board?.packGeneratedAt) notFound();
  audit(user.id, "board_pack_viewed", "position", pack.position.id);
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Board packs", href: "/board" }, { label: pack.position.code }]}
        title={pack.position.title}
        description={`${pack.position.department} · read only`}
        actions={
          <ButtonAnchor href={`/print/board/${pack.position.id}`} target="_blank" variant="secondary">
            <FileDown aria-hidden /> PDF
          </ButtonAnchor>
        }
      />
      <Card>
        <CardBody>
          <BoardPackView pack={pack} />
        </CardBody>
      </Card>
    </>
  );
}
