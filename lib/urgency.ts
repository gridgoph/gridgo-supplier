import type { StatusIconName, StatusTone } from "@/components/StatusChip";

/**
 * How much time is left on a job, in plain language.
 *
 * The demo API carries no accept-SLA timer, so nothing here invents one. Every
 * value is derived from the client's own deadline (or the promised finish the
 * shop committed to), which is the only real clock on an order.
 */

export type UrgencyLevel = "overdue" | "urgent" | "soon" | "ok" | "undated";

export type Urgency = {
  level: UrgencyLevel;
  /** Says the state: "Late by 3 hours", "Due in 5 hours". */
  label: string;
  tone: StatusTone;
  icon: StatusIconName;
  /** Negative once the moment has passed. Null when there is no date. */
  hoursRemaining: number | null;
};

const HOUR_MS = 3_600_000;

/** Under 12 h to go reads as urgent; under 48 h as soon. */
export function deadlineUrgency(
  iso: string | null | undefined,
  now: Date = new Date(),
): Urgency {
  if (!iso) {
    return {
      level: "undated",
      label: "No date set",
      tone: "neutral",
      icon: "clock",
      hoursRemaining: null,
    };
  }
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) {
    return {
      level: "undated",
      label: "No date set",
      tone: "neutral",
      icon: "clock",
      hoursRemaining: null,
    };
  }

  const hoursRemaining = (at.getTime() - now.getTime()) / HOUR_MS;

  if (hoursRemaining < 0) {
    return {
      level: "overdue",
      label: `Late by ${humanSpan(-hoursRemaining)}`,
      tone: "error",
      icon: "triangle-alert",
      hoursRemaining,
    };
  }
  if (hoursRemaining < 12) {
    return {
      level: "urgent",
      label: `Due in ${humanSpan(hoursRemaining)}`,
      tone: "warning",
      icon: "clock",
      hoursRemaining,
    };
  }
  if (hoursRemaining < 48) {
    return {
      level: "soon",
      label: `Due in ${humanSpan(hoursRemaining)}`,
      tone: "info",
      icon: "clock",
      hoursRemaining,
    };
  }
  return {
    level: "ok",
    label: `Due in ${humanSpan(hoursRemaining)}`,
    tone: "neutral",
    icon: "clock",
    hoursRemaining,
  };
}

/** "45 minutes", "3 hours", "2 days" — never a bare number. */
export function humanSpan(hours: number): string {
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }
  if (hours < 48) {
    const whole = Math.round(hours);
    return `${whole} hour${whole === 1 ? "" : "s"}`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}
