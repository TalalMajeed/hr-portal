import { runDueReminders } from "@/lib/reminders";

/** F10: call every 10 to 15 minutes from a scheduler. Send the CRON_SECRET in the x-cron-secret header when it is set. */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("x-cron-secret") !== secret) return Response.json({ error: "Not allowed" }, { status: 401 });
  const sent = runDueReminders();
  return Response.json({ sent, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
