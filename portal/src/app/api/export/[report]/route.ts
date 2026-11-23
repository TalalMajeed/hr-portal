import { eq } from "drizzle-orm";
import { db, sqlite } from "@/lib/db";
import { positions } from "@/lib/db/schema";
import { getUser } from "@/lib/auth";
import { canManagePosition, visiblePositionIds } from "@/lib/access";
import { REPORTS, applicationsReport, type ReportTable } from "@/lib/reports";
import { getBoardPack } from "@/lib/board";
import { fileResponse, toCsv, toXlsx } from "@/lib/export";
import { audit } from "@/lib/audit";
import { ROUND_LABELS, STAFF_ROLES } from "@/lib/constants";
import { round1 } from "@/lib/format";
import type { PanelRound } from "@/lib/db/schema";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** I9: every report, the applications of any post, and the board pack, as Excel or CSV. `all` exports every table (data ownership). */
export async function GET(request: Request, ctx: RouteContext<"/api/export/[report]">) {
  const user = await getUser();
  if (!user || !STAFF_ROLES.includes(user.role)) return new Response("Not allowed", { status: 403 });
  const { report } = await ctx.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const stamp = new Date().toISOString().slice(0, 10);
  let tables: ReportTable[];
  let name = report;

  if (report === "applications" || report === "board") {
    const p = db.select().from(positions).where(eq(positions.id, Number(url.searchParams.get("position")))).get();
    if (!p || !canManagePosition(user, p)) return new Response("Not found", { status: 404 });
    name = `${p.code}-${report}`;
    if (report === "applications") {
      tables = [applicationsReport(p.id)];
    } else {
      const pack = getBoardPack(p.id)!;
      const rounds = (["interview", "talk", "second_round"] as PanelRound[]).filter((r) => pack.candidates.some((c) => c.rounds[r]));
      tables = [
        {
          key: "board",
          title: `Selection Board: ${p.title}`,
          description: `${p.code}. Weighted scores out of 100 from the position's rubric.`,
          columns: ["Panel rank", "Application no.", "Candidate", "Shortlisting", ...rounds.map((r) => ROUND_LABELS[r]), "Overall", "Board decision", "Board rank", "Offer"],
          rows: pack.candidates.map((c) => [
            c.consensusRank ?? "",
            c.appNo,
            c.name,
            round1(c.shortlistScore),
            ...rounds.map((r) => round1(c.rounds[r]?.avg)),
            round1(c.overall),
            c.decision?.decision.replace("_", " ") ?? "",
            c.decision?.rank ?? "",
            c.offer?.status ?? "",
          ]),
        },
      ];
    }
  } else if (report === "all") {
    if (!["super_admin", "ed"].includes(user.role)) return new Response("Only the super admin or ED can export all data.", { status: 403 });
    const names = (sqlite.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' and name not in ('auth_sessions')").all() as { name: string }[]).map((r) => r.name);
    tables = names.map((t) => {
      const rows = sqlite.prepare(`select * from "${t}"`).all() as Record<string, unknown>[];
      const columns = rows[0] ? Object.keys(rows[0]).filter((c) => !["password_hash", "access_token", "verify_token", "reset_token"].includes(c)) : [];
      return { key: t, title: t, description: `${rows.length} rows`, columns, rows: rows.map((r) => columns.map((c) => (r[c] === null ? "" : (r[c] as string | number)))) };
    });
    if (format === "csv") return new Response("Use Excel for the full export: it has one sheet per table.", { status: 400 });
    name = "du-portal-all-data";
  } else if (REPORTS[report]) {
    tables = [REPORTS[report](visiblePositionIds(user))];
  } else {
    return new Response("Unknown report", { status: 404 });
  }

  audit(user.id, "exported", "report", null, `${name}.${format}`);
  if (format === "csv") return fileResponse(toCsv(tables[0]), `${name}-${stamp}.csv`, "text/csv; charset=utf-8");
  return fileResponse(await toXlsx(tables), `${name}-${stamp}.xlsx`, XLSX);
}
