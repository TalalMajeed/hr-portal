import { PKT } from "@/lib/constants";

type DateInput = string | Date | null | undefined;

function toDate(d: DateInput) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Mon 23 Nov 2026" */
export function formatDate(d: DateInput, timeZone = PKT) {
  const date = toDate(d);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone }).format(date);
}

/** "23 Nov 2026" without the weekday, for dense tables. */
export function formatShortDate(d: DateInput, timeZone = PKT) {
  const date = toDate(d);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone }).format(date);
}

/** "Mon 23 Nov 2026, 10:30" in the given zone. */
export function formatDateTime(d: DateInput, timeZone = PKT) {
  const date = toDate(d);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(date);
}

export function formatTime(d: DateInput, timeZone = PKT) {
  const date = toDate(d);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(date);
}

/** Short zone name such as "PKT", "PST" or "GMT+5". */
export function zoneAbbr(timeZone: string, d: DateInput = new Date()) {
  const date = toDate(d) ?? new Date();
  if (timeZone === PKT) return "PKT";
  const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? timeZone;
}

/** "Mon 23 Nov 2026, 10:30 PKT" plus the candidate's local time when the zone differs. */
export function formatDual(d: DateInput, otherZone?: string | null) {
  const pkt = `${formatDateTime(d, PKT)} PKT`;
  if (!otherZone || otherZone === PKT) return pkt;
  return `${pkt} (${formatDateTime(d, otherZone)} ${zoneAbbr(otherZone, d)})`;
}

/** Converts a datetime-local value entered in PKT ("2026-11-24T10:00") to a UTC ISO string. */
export function pktInputToIso(value: string) {
  if (!value) return "";
  return new Date(`${value}:00+05:00`).toISOString();
}

/** Formats a UTC ISO string as a datetime-local value in PKT. */
export function isoToPktInput(iso: string | null | undefined) {
  const date = toDate(iso);
  if (!date) return "";
  const shifted = new Date(date.getTime() + 5 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

export function daysBetween(a: DateInput, b: DateInput) {
  const x = toDate(a);
  const y = toDate(b);
  if (!x || !y) return null;
  return Math.round((y.getTime() - x.getTime()) / 86_400_000);
}

export function relativeDays(d: DateInput) {
  const days = daysBetween(new Date(), d);
  if (days === null) return "";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Standard deviation, used to show the spread of reviewer scores (D4). */
export function spread(values: number[]) {
  if (values.length < 2) return 0;
  const avg = average(values)!;
  return Math.sqrt(values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length);
}

export function round1(n: number | null | undefined) {
  return n === null || n === undefined ? "" : (Math.round(n * 10) / 10).toFixed(1);
}

export function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
