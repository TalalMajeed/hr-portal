import "server-only";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { documentFiles, documents, settings, type DocumentKind } from "@/lib/db/schema";
import { audit } from "@/lib/audit";

export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];
export const ACCEPT_ATTR = ".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png";

export async function maxUploadBytes() {
  const row = (await db.select().from(settings).where(eq(settings.key, "max_upload_mb")))[0];
  return Math.min(4, Number(row?.value ?? 4)) * 1024 * 1024;
}

/** Checks the file's first bytes, so a renamed file can't pass as a PDF or image. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: ".pdf" };
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return { mime: "image/png", ext: ".png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: ".jpg" };
  return null;
}

/**
 * Malware scan. This build blocks the EICAR test signature and PDFs that carry
 * JavaScript or auto-run actions. Production would hand the file to ClamAV here.
 */
function scan(buf: Buffer, mime: string) {
  const text = buf.toString("latin1");
  if (text.includes("EICAR-STANDARD-ANTIVIRUS-TEST-FILE")) return "The file failed the malware scan.";
  if (mime === "application/pdf" && /\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(text)) {
    return "PDFs with embedded scripts or files aren't accepted. Save it as a plain PDF and try again.";
  }
  return null;
}

export type UploadMeta = {
  kind: DocumentKind;
  ownerUserId?: number | null;
  applicationId?: number | null;
  positionId?: number | null;
  label?: string;
  uploadedBy?: number | null;
};

export type UploadResult = { ok: true; id: number } | { ok: false; error: string };

export function isFile(value: FormDataEntryValue | null): value is File {
  return typeof value === "object" && value !== null && "arrayBuffer" in value && (value as File).size > 0;
}

export async function saveUpload(file: File, meta: UploadMeta): Promise<UploadResult> {
  const ext = path.extname(file.name).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return { ok: false, error: `${file.name}: only PDF, JPG and PNG files are accepted.` };
  const limit = await maxUploadBytes();
  if (file.size > limit) return { ok: false, error: `${file.name} is larger than ${limit / 1024 / 1024} MB.` };
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) return { ok: false, error: `${file.name} isn't a real PDF, JPG or PNG file.` };
  const scanError = scan(buf, kind.mime);
  if (scanError) {
    await audit(meta.uploadedBy, "upload_rejected", "document", null, `${file.name}: ${scanError}`);
    return { ok: false, error: scanError };
  }
  const storedName = `${randomBytes(16).toString("hex")}${kind.ext}`;
  const row = (await db
    .insert(documents)
    .values({
      ownerUserId: meta.ownerUserId ?? null,
      applicationId: meta.applicationId ?? null,
      positionId: meta.positionId ?? null,
      kind: meta.kind,
      label: meta.label ?? "",
      filename: file.name.slice(0, 200),
      storedName,
      mime: kind.mime,
      size: file.size,
      uploadedBy: meta.uploadedBy ?? null,
    })
    .returning({ id: documents.id })
    )[0];
  await db.insert(documentFiles).values({ documentId: row.id, data: buf });
  await audit(meta.uploadedBy, "upload", "document", row.id, `${meta.kind}: ${file.name}`);
  return { ok: true, id: row.id };
}

/** The file's bytes. Uploads are stored in Postgres so they survive serverless deploys. */
export async function readUpload(documentId: number) {
  const row = (await db.select({ data: documentFiles.data }).from(documentFiles).where(eq(documentFiles.documentId, documentId)))[0];
  return row?.data ?? null;
}
