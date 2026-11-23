"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationNotes, positions } from "@/lib/db/schema";
import { assertUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { createSourcedApplication } from "@/lib/candidate-intake";
import { isFile } from "@/lib/uploads";
import { DEGREE_LEVELS } from "@/lib/constants";

export type ImportRow = { line: number; name: string; ok: boolean; message: string };
export type ImportState = { error?: string; rows?: ImportRow[]; created?: number } | null;

/** A small CSV reader: commas, quoted fields with "" escapes, and \n or \r\n lines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** Accepts a level number (1 to 6) or a word such as "PhD", "MS", "BS". */
function toLevel(value: string, degree: string) {
  const v = value.trim();
  if (DEGREE_LEVELS.some((d) => d.value === v)) return v;
  const t = `${v} ${degree}`.toLowerCase();
  if (/phd|doctor/.test(t)) return "6";
  if (/\bms\b|mphil|master|\bma\b|\bmsc\b|mba/.test(t)) return "5";
  if (/\bbs\b|bachelor|\bbsc\b|\bba\b|\bbe\b/.test(t)) return "4";
  if (/intermediate|a level|fsc/.test(t)) return "2";
  return "4";
}

/** Brings existing candidates (and any scores) in from a spreadsheet exported as CSV. */
export async function importCandidatesAction(_: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const user = await assertUser(["hr", "super_admin"]);
    const positionId = Number(fd.get("positionId"));
    const position = (await db.select().from(positions).where(eq(positions.id, positionId)))[0];
    if (!position) return { error: "Choose the position to import into." };
    const file = fd.get("file");
    let text = typeof fd.get("csv") === "string" ? String(fd.get("csv")) : "";
    if (isFile(file)) {
      if (!/\.csv$/i.test(file.name) || file.size > 2 * 1024 * 1024) return { error: "Upload a .csv file under 2 MB." };
      text = await file.text();
    }
    const table = parseCsv(text.replace(/^﻿/, ""));
    if (table.length < 2) return { error: "Paste or upload a CSV with a header row and at least one candidate." };
    const header = table[0].map((h) => h.trim().toLowerCase());
    if (!header.includes("name")) return { error: "The header row needs at least a name column." };
    if (table.length > 501) return { error: "Import up to 500 candidates at a time." };
    const col = (r: string[], k: string) => (header.indexOf(k) >= 0 ? (r[header.indexOf(k)] ?? "").trim() : "");

    const results: ImportRow[] = [];
    let created = 0;
    for (const [i, r] of table.slice(1).entries()) {
      const line = i + 2;
      const name = col(r, "name");
      const srcRaw = col(r, "source").toLowerCase();
      const source = srcRaw === "agency" || srcRaw === "referral" ? srcRaw : "direct";
      const res = await createSourcedApplication({
        positionId,
        name,
        email: col(r, "email"),
        phone: col(r, "phone"),
        cnic: col(r, "cnic"),
        level: toLevel(col(r, "level"), col(r, "degree")),
        degree: col(r, "degree"),
        field: col(r, "field"),
        institution: col(r, "institution"),
        years: Math.max(0, Math.min(50, Number(col(r, "years")) || 0)),
        source,
        actorId: user.id,
      });
      if (!res.ok) {
        results.push({ line, name: name || "(no name)", ok: false, message: res.error });
        continue;
      }
      created++;
      const score = col(r, "score");
      if (score) {
        // Old scores were given on other scales, so they are kept as an internal note rather than rubric scores.
        await db.insert(applicationNotes).values({ applicationId: res.applicationId, userId: user.id, body: `Imported score from the previous process: ${score}` });
      }
      results.push({
        line,
        name,
        ok: true,
        message: `Added as ${res.appNo}${res.duplicateOf ? `, possible duplicate of ${res.duplicateOf}` : ""}${score ? `, score ${score} kept as a note` : ""}.`,
      });
    }
    await audit(user.id, "candidates_imported", "position", positionId, `${created} of ${table.length - 1} rows`);
    revalidatePath(`/admin/positions/${positionId}/applications`);
    return { rows: results, created };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "The import failed. Check the file and try again." };
  }
}
