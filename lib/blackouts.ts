import { dayKeyLabel, daysBetween, fromDayKey } from "@/lib/day";

/**
 * Shop closures ("blackout windows").
 *
 * The demo API has no closure endpoint, so these live on this device only.
 * Every screen that shows one says so — the shop must never believe GRIDGO is
 * routing work around a closure Operations cannot see.
 */

export type BlackoutReasonId =
  | "holiday"
  | "maintenance"
  | "inventory"
  | "staff"
  | "other";

export const BLACKOUT_REASONS: readonly { id: BlackoutReasonId; label: string }[] = [
  { id: "holiday", label: "Holiday" },
  { id: "maintenance", label: "Equipment maintenance" },
  { id: "inventory", label: "Inventory day" },
  { id: "staff", label: "Short staffed" },
  { id: "other", label: "Other" },
] as const;

export type Blackout = {
  id: string;
  /** Local day keys, inclusive. */
  startDay: string;
  endDay: string;
  reason: BlackoutReasonId;
  /** Free text — the shop's own words. Optional. */
  note: string;
};

export function blackoutReasonLabel(id: BlackoutReasonId): string {
  return BLACKOUT_REASONS.find((r) => r.id === id)?.label ?? "Closed";
}

/** Longest closure the form accepts, so a mis-set end date is caught early. */
export const MAX_BLACKOUT_DAYS = 60;

/**
 * Why this closure cannot be saved, in words that name the fix. Null when it
 * is valid.
 */
export function validateBlackout(
  candidate: Pick<Blackout, "startDay" | "endDay">,
  existing: Blackout[] = [],
  candidateId?: string,
): string | null {
  const start = fromDayKey(candidate.startDay);
  const end = fromDayKey(candidate.endDay);
  if (!start || !end) return "Pick both a first and a last closed day.";
  if (end < start) return "The last closed day is before the first. Move the end date later.";

  const span = (daysBetween(candidate.startDay, candidate.endDay) ?? 0) + 1;
  if (span > MAX_BLACKOUT_DAYS) {
    return `A closure can cover at most ${MAX_BLACKOUT_DAYS} days. Split it into shorter windows.`;
  }

  const clash = existing.find(
    (b) =>
      b.id !== candidateId &&
      b.startDay <= candidate.endDay &&
      candidate.startDay <= b.endDay,
  );
  if (clash) {
    return `This overlaps the closure from ${dayKeyLabel(clash.startDay)} to ${dayKeyLabel(
      clash.endDay,
    )}. Edit that one instead.`;
  }

  return null;
}

/** The closure covering a day, or null. */
export function blackoutOnDay(blackouts: Blackout[], dayKey: string): Blackout | null {
  return blackouts.find((b) => b.startDay <= dayKey && dayKey <= b.endDay) ?? null;
}

/** "Mon 11 Aug" for one day, "Mon 11 Aug – Wed 13 Aug" for a run. */
export function blackoutSpanLabel(blackout: Blackout): string {
  if (blackout.startDay === blackout.endDay) return dayKeyLabel(blackout.startDay);
  return `${dayKeyLabel(blackout.startDay)} – ${dayKeyLabel(blackout.endDay)}`;
}
