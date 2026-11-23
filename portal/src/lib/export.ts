import "server-only";
import ExcelJS from "exceljs";
import type { ReportTable } from "@/lib/reports";

/** One sheet per table, DU teal header row, frozen header, sensible column widths. */
export async function toXlsx(tables: ReportTable[]) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "DU Job Portal";
  wb.created = new Date();
  for (const t of tables) {
    const ws = wb.addWorksheet(t.title.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Sheet");
    ws.addRow([t.title]).font = { bold: true, size: 14 };
    ws.addRow([t.description]).font = { color: { argb: "FF4B5563" } };
    ws.addRow([]);
    const header = ws.addRow(t.columns);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.eachCell((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF008080" } };
    });
    for (const r of t.rows) ws.addRow(r);
    ws.views = [{ state: "frozen", ySplit: 4 }];
    t.columns.forEach((col, i) => {
      const longest = Math.max(col.length, ...t.rows.map((r) => String(r[i] ?? "").length));
      ws.getColumn(i + 1).width = Math.min(60, Math.max(10, longest + 2));
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toCsv(t: ReportTable) {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [t.columns, ...t.rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export function fileResponse(body: Buffer | string, filename: string, type: string) {
  return new Response(typeof body === "string" ? body : new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
