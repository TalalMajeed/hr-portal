import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  positionDocs,
  positionEvents,
  positions,
  type CriteriaContent,
  type DocKind,
  type JdContent,
  type RubricContent,
  type Stage,
  type TorContent,
} from "@/lib/db/schema";
import { audit } from "@/lib/audit";

type DocMap = {
  tor_position: TorContent;
  tor_committee: TorContent;
  jd: JdContent;
  criteria: CriteriaContent;
  rubric: RubricContent;
};

export const EMPTY_RUBRIC: RubricContent = { shortlisting: [], interview: [], talk: [], second_round: [] };

export const EMPTY_JD: JdContent = {
  summary: "",
  duties: [],
  requiredQualifications: [],
  preferredQualifications: [],
  experience: "",
  skills: [],
  requiredDocuments: ["cv"],
};

/** The current version of a ToR, JD, criteria or rubric. */
export async function getDoc<K extends DocKind>(positionId: number, kind: K): Promise<(DocMap[K] & { _version: number }) | null> {
  const row = (await db
    .select()
    .from(positionDocs)
    .where(and(eq(positionDocs.positionId, positionId), eq(positionDocs.kind, kind)))
    .orderBy(desc(positionDocs.version))
    )[0];
  if (!row) return null;
  return { ...(row.content as DocMap[K]), _version: row.version };
}

/** A8: every save creates a new version; nothing is overwritten. */
export async function saveDoc<K extends DocKind>(positionId: number, kind: K, content: DocMap[K], userId: number, note = "") {
  const current = (await db
    .select({ v: sql<number>`coalesce(max(${positionDocs.version}), 0)` })
    .from(positionDocs)
    .where(and(eq(positionDocs.positionId, positionId), eq(positionDocs.kind, kind)))
    )[0];
  const version = (current?.v ?? 0) + 1;
  await db.insert(positionDocs).values({ positionId, kind, version, content, note, createdBy: userId });
  await db.update(positions).set({ updatedAt: new Date().toISOString() }).where(eq(positions.id, positionId));
  await audit(userId, "doc_saved", "position", positionId, `${kind} v${version}${note ? `: ${note}` : ""}`);
  return version;
}

export async function docHistory(positionId: number) {
  return (await db
    .select()
    .from(positionDocs)
    .where(eq(positionDocs.positionId, positionId))
    .orderBy(desc(positionDocs.createdAt), desc(positionDocs.version))
    );
}

/** Moves a position to a stage and records it for time-to-hire reporting (I5). Only moves forward unless `force`. */
export async function setStage(positionId: number, stage: Stage, userId: number | null, reason = "", force = false) {
  const p = (await db.select({ stage: positions.stage }).from(positions).where(eq(positions.id, positionId)))[0];
  if (!p) return;
  if (p.stage === stage || (!force && p.stage > stage)) return;
  await db.update(positions).set({ stage, updatedAt: new Date().toISOString() }).where(eq(positions.id, positionId));
  await db.insert(positionEvents).values({ positionId, type: "stage_changed", fromStage: p.stage, toStage: stage, reason, userId });
  await audit(userId, "stage_changed", "position", positionId, `Stage ${p.stage} to ${stage}${reason ? `: ${reason}` : ""}`);
}

export async function logPositionEvent(positionId: number, type: string, reason: string, userId: number | null) {
  await db.insert(positionEvents).values({ positionId, type, reason, userId });
  await audit(userId, type, "position", positionId, reason);
}

export async function nextPositionCode() {
  const year = new Date().getFullYear();
  const row = (await db
    .select({ n: sql<number>`count(*)::int` })
    .from(positions)
    .where(sql`${positions.code} like ${`DU-${year}-%`}`)
    )[0];
  return `DU-${year}-${String((row?.n ?? 0) + 1).padStart(3, "0")}`;
}

export async function getPosition(id: number) {
  return (await db.select().from(positions).where(eq(positions.id, id)))[0] ?? null;
}
