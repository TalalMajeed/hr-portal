import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canManagePosition } from "@/lib/access";
import { getBoardPack } from "@/lib/board";
import { audit } from "@/lib/audit";
import { Letterhead } from "@/components/print/letterhead";
import { BoardPackView } from "@/components/board/board-pack";

export const metadata: Metadata = { title: "Selection Board pack" };

export default async function PrintBoardPack({ params }: PageProps<"/print/board/[id]">) {
  const user = await requireUser(["super_admin", "ed", "hr", "hiring_lead", "board"]);
  const pack = getBoardPack(Number((await params).id));
  if (!pack) notFound();
  const allowed = user.role === "board" ? pack.position.stage === 10 && !!pack.board?.packGeneratedAt : canManagePosition(user, pack.position);
  if (!allowed) notFound();
  audit(user.id, "board_pack_exported", "position", pack.position.id, "PDF");
  return (
    <Letterhead
      title={`Selection Board pack: ${pack.position.title}`}
      subtitle={`${pack.position.code} · ${pack.position.department}`}
      back={user.role === "board" ? `/board/${pack.position.id}` : `/admin/positions/${pack.position.id}/board`}
    >
      <BoardPackView pack={pack} />
    </Letterhead>
  );
}
