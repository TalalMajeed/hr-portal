import "server-only";
import { db } from "@/lib/db";
import { auditLog } from "@/lib/db/schema";

/**
 * Records a view, change, status update, score or email. The table is append-only:
 * database triggers reject any UPDATE or DELETE on it.
 */
export function audit(userId: number | null | undefined, action: string, entity: string, entityId?: number | null, detail = "") {
  db.insert(auditLog)
    .values({ userId: userId ?? null, action, entity, entityId: entityId ?? null, detail })
    .run();
}
