import { STUDIO_TIMEZONE } from "../config";

/** Returns `override` if provided, then checks DEMO_NOW env var,
 *  otherwise real Date.now().
 *  All fee/window logic must use this instead of new Date(). */
export function getNow(override?: Date): Date {
  if (override) return override;
  const envNow = process.env.DEMO_NOW;
  if (envNow) return new Date(envNow);
  return new Date();
}

/** Format a UTC ISO string to a human-readable ET string.
 *  e.g. "2026-10-31T18:00:00+00:00" → "Sat Oct 31, 6:00 PM ET" */
export function toET(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString("en-US", {
    timeZone: STUDIO_TIMEZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " ET";
}
