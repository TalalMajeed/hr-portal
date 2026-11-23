/** What a server action returns to an <ActionForm>. */
export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> } | null;

export function fail(error: string, fieldErrors?: Record<string, string>): ActionState {
  return { ok: false, error, fieldErrors };
}

export function done(message = "Saved."): ActionState {
  return { ok: true, message };
}

/** Reads a trimmed string from form data. */
export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function num(fd: FormData, key: string, fallback = 0) {
  const n = Number(str(fd, key));
  return Number.isFinite(n) ? n : fallback;
}

export function bool(fd: FormData, key: string) {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}

/** Splits a textarea into non-empty lines. */
export function lines(fd: FormData, key: string) {
  return str(fd, key)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Runs an action body and turns thrown errors into a friendly message. */
export async function safe(fn: () => Promise<ActionState> | ActionState): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_")) throw e;
    return fail(e instanceof Error ? e.message : "Something went wrong. Try again.");
  }
}
