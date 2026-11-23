import { runDueReminders } from "@/lib/reminders";

/**
 * F10: sends due reminders. Vercel Cron calls it with `Authorization: Bearer <CRON_SECRET>`;
 * other schedulers can send the secret in the x-cron-secret header instead.
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.headers.get("x-cron-secret");
  if (secret && given !== secret) return Response.json({ error: "Not allowed" }, { status: 401 });
  const sent = await runDueReminders();
  return Response.json({ sent, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
