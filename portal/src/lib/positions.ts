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
export function getDoc<K extends DocKind>(positionId: number, kind: K): (DocMap[K] & { _version: number }) | null {
  const row = db
    .select()
    .from(positionDocs)
    .where(and(eq(positionDocs.positionId, positionId), eq(positionDocs.kind, kind)))
    .orderBy(desc(positionDocs.version))
    .get();
  if (!row) return null;
  return { ...(row.content as DocMap[K]), _version: row.version };
}

/** A8: every save creates a new version; nothing is overwritten. */
export function saveDoc<K extends DocKind>(positionId: number, kind: K, content: DocMap[K], userId: number, note = "") {
  const current = db
    .select({ v: sql<number>`coalesce(max(${positionDocs.version}), 0)` })
    .from(positionDocs)
    .where(and(eq(positionDocs.positionId, positionId), eq(positionDocs.kind, kind)))
    .get();
  const version = (current?.v ?? 0) + 1;
  db.insert(positionDocs).values({ positionId, kind, version, content, note, createdBy: userId }).run();
  db.update(positions).set({ updatedAt: new Date().toISOString() }).where(eq(positions.id, positionId)).run();
  audit(userId, "doc_saved", "position", positionId, `${kind} v${version}${note ? `: ${note}` : ""}`);
  return version;
}

export function docHistory(positionId: number) {
  return db
    .select()
    .from(positionDocs)
    .where(eq(positionDocs.positionId, positionId))
    .orderBy(desc(positionDocs.createdAt), desc(positionDocs.version))
    .all();
}

/** Moves a position to a stage and records it for time-to-hire reporting (I5). Only moves forward unless `force`. */
export function setStage(positionId: number, stage: Stage, userId: number | null, reason = "", force = false) {
  const p = db.select({ stage: positions.stage }).from(positions).where(eq(positions.id, positionId)).get();
  if (!p) return;
  if (p.stage === stage || (!force && p.stage > stage)) return;
  db.update(positions).set({ stage, updatedAt: new Date().toISOString() }).where(eq(positions.id, positionId)).run();
  db.insert(positionEvents).values({ positionId, type: "stage_changed", fromStage: p.stage, toStage: stage, reason, userId }).run();
  audit(userId, "stage_changed", "position", positionId, `Stage ${p.stage} to ${stage}${reason ? `: ${reason}` : ""}`);
}

export function logPositionEvent(positionId: number, type: string, reason: string, userId: number | null) {
  db.insert(positionEvents).values({ positionId, type, reason, userId }).run();
  audit(userId, type, "position", positionId, reason);
}

export function nextPositionCode() {
  const year = new Date().getFullYear();
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(positions)
    .where(sql`${positions.code} like ${`DU-${year}-%`}`)
    .get();
  return `DU-${year}-${String((row?.n ?? 0) + 1).padStart(3, "0")}`;
}

export function getPosition(id: number) {
  return db.select().from(positions).where(eq(positions.id, id)).get() ?? null;
}
