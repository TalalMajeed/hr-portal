import "server-only";
import { randomInt } from "node:crypto";

export type MeetingProvider = "zoom" | "meet" | "teams";

export type Meeting = {
  provider: MeetingProvider;
  url: string;
  id: string;
  passcode: string;
  waitingRoom: boolean;
  /** True when no provider credentials are set and the link is a placeholder. */
  simulated: boolean;
};

type Input = { provider: MeetingProvider; topic: string; startsAt: string; durationMin: number };

function digits(n: number) {
  return Array.from({ length: n }, () => randomInt(0, 10)).join("");
}

function letters(n: number) {
  const a = "abcdefghijklmnopqrstuvwxyz";
  return Array.from({ length: n }, () => a[randomInt(0, a.length)]).join("");
}

export function zoomConfigured() {
  return !!(process.env.ZOOM_ACCOUNT_ID && process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET);
}

async function zoomToken() {
  const auth = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(process.env.ZOOM_ACCOUNT_ID!)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!res.ok) throw new Error(`Zoom sign-in failed (${res.status}). Check the Zoom credentials in the server settings.`);
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

/** F5: Zoom Server-to-Server OAuth when configured, otherwise a clearly simulated link. */
async function createZoom(input: Input): Promise<Meeting> {
  if (!zoomConfigured()) {
    const id = digits(11);
    const passcode = digits(6);
    return { provider: "zoom", url: `https://zoom.us/j/${id}?pwd=simulated${passcode}`, id, passcode, waitingRoom: true, simulated: true };
  }
  const token = await zoomToken();
  const passcode = digits(6);
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: input.topic.slice(0, 200),
      type: 2,
      start_time: input.startsAt,
      duration: input.durationMin,
      timezone: "UTC",
      password: passcode,
      settings: { waiting_room: true, join_before_host: false, mute_upon_entry: true },
    }),
  });
  if (!res.ok) throw new Error(`Zoom could not create the meeting (${res.status}). Try again or choose another provider.`);
  const m = (await res.json()) as { id: number; join_url: string; password?: string };
  return { provider: "zoom", url: m.join_url, id: String(m.id), passcode: m.password ?? passcode, waitingRoom: true, simulated: false };
}

export async function createMeeting(input: Input): Promise<Meeting> {
  if (input.provider === "zoom") return createZoom(input);
  if (input.provider === "meet") {
    const code = `${letters(3)}-${letters(4)}-${letters(3)}`;
    return { provider: "meet", url: `https://meet.google.com/${code}`, id: code, passcode: "", waitingRoom: true, simulated: true };
  }
  const id = digits(12);
  return { provider: "teams", url: `https://teams.microsoft.com/l/meetup-join/simulated-${id}`, id, passcode: digits(6), waitingRoom: true, simulated: true };
}
