/**
 * Date/time display helpers. Times are shown in the device locale; deadlines
 * from the API already carry +08:00 (Asia/Manila) for the pilot.
 */

export function formatDeadlineLabel(iso: string | null | undefined): string {
  if (!iso) return "No deadline";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No deadline";
  return d.toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDeadlineTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The shop's local clock, in the same locale every other time on this app uses. */
export function formatClockTime(date: Date, opts?: { seconds?: boolean }): string {
  return date.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
    ...(opts?.seconds === false ? {} : { second: "2-digit" }),
  });
}

export function formatDeadlineFull(iso: string | null | undefined): string {
  if (!iso) return "Not set";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Not set";
  return d.toLocaleString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeDay(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date";

  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target.getTime() - start.getTime()) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays < 0) return `${Math.abs(diffDays)} days overdue`;
  return formatDeadlineLabel(iso);
}

/**
 * A notification's own stamp: the date and the time of day, both.
 *
 * An alert is a thing that happened at a moment, and a shop reading a list of
 * them wants to know which day as well as which hour — "3:45 PM" alone is
 * ambiguous the morning after.
 */
export function formatNotificationAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  return `${date} · ${time}`;
}

export function formatTimelineAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The date a shop is held to: its own `readyBy`, and nothing else.
 *
 * `deadline` is the client's, and GRIDGO fills `promisedDate` from it when
 * `readyBy` is missing, so neither may stand in for it. A job without
 * `readyBy` is undated on every shop screen, never dated by the client.
 */
export function shopDueAt(job: { readyBy?: string | null }): string | null {
  return job.readyBy || null;
}
