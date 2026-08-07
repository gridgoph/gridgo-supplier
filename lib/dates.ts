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

/** Earliest promised/deadline among jobs, or null. */
export function nextPromisedDeadline(
  jobs: { promisedDate: string | null; deadline: string | null }[],
  now: Date = new Date(),
): string | null {
  const stamps = jobs
    .map((j) => j.promisedDate || j.deadline)
    .filter((v): v is string => Boolean(v))
    .filter((v) => !Number.isNaN(new Date(v).getTime()))
    .filter((v) => new Date(v).getTime() >= now.getTime() - 86_400_000)
    .sort((a, b) => a.localeCompare(b));
  return stamps[0] ?? null;
}
