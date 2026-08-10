import type { Order, SupplierService } from "@/lib/api";
import { toDayKey } from "@/lib/day";

/**
 * Shop capacity, derived only from fields the API really holds.
 *
 * `capacityDaily` / `capacityWeekly` / `turnaroundHours` are editable numbers on
 * a supplier service line. Committed load is the sum of the quantities of jobs
 * the shop has promised for a day. Nothing here is estimated or invented; where
 * the shop has set no capacity, the screens say "not set" rather than guessing.
 */

/** Bounds for every numeric capacity control. A bare keyboard is never enough. */
export const CAPACITY_BOUNDS = {
  daily: { min: 0, max: 5000, step: 5 },
  weekly: { min: 0, max: 20000, step: 25 },
  turnaround: { min: 1, max: 720, step: 1 },
} as const;

export type CapacityField = keyof typeof CAPACITY_BOUNDS;

export function clampCapacity(field: CapacityField, value: number): number {
  const { min, max } = CAPACITY_BOUNDS[field];
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** The three numbers a shop edits on one service line. */
export type CapacityDraft = {
  capacityDaily: number;
  capacityWeekly: number;
  turnaroundHours: number;
};

/** The saved values a draft starts from, with the API's own defaults applied. */
export function capacityDraftFor(service: SupplierService): CapacityDraft {
  return {
    capacityDaily: clampCapacity("daily", service.capacityDaily ?? 0),
    capacityWeekly: clampCapacity("weekly", service.capacityWeekly ?? 0),
    turnaroundHours: clampCapacity("turnaround", service.turnaroundHours ?? 48),
  };
}

export function capacityDraftChanged(service: SupplierService, draft: CapacityDraft): boolean {
  const saved = capacityDraftFor(service);
  return (
    saved.capacityDaily !== draft.capacityDaily ||
    saved.capacityWeekly !== draft.capacityWeekly ||
    saved.turnaroundHours !== draft.turnaroundHours
  );
}

/**
 * Why a capacity value cannot be saved, naming the fix. Null when it is fine.
 * Weekly below daily is the mistake that actually happens on a shop floor.
 */
export function validateCapacity(values: CapacityDraft): string | null {
  const { daily, weekly, turnaround } = CAPACITY_BOUNDS;
  if (values.capacityDaily < daily.min || values.capacityDaily > daily.max) {
    return `Daily capacity must be between ${daily.min} and ${daily.max} units.`;
  }
  if (values.capacityWeekly < weekly.min || values.capacityWeekly > weekly.max) {
    return `Weekly capacity must be between ${weekly.min} and ${weekly.max} units.`;
  }
  if (values.turnaroundHours < turnaround.min || values.turnaroundHours > turnaround.max) {
    return `Turnaround must be between ${turnaround.min} and ${turnaround.max} hours.`;
  }
  if (values.capacityWeekly > 0 && values.capacityWeekly < values.capacityDaily) {
    return "Weekly capacity is lower than daily capacity. Raise the weekly figure or lower the daily one.";
  }
  return null;
}

/** Service lines GRIDGO can currently route work to. */
export function isLiveService(service: Pick<SupplierService, "state">): boolean {
  return service.state === "live";
}

/**
 * Plain label for a service line's accreditation state. The vocabulary lives in
 * `lib/supplierServices.ts` so capacity and the catalogue use the same words.
 */
export { presentServiceState } from "@/lib/supplierServices";

/**
 * The shop's daily unit capacity: the total of every live service line. Null
 * when no live line has a figure set — the screens then say so.
 */
export function shopDailyCapacity(services: SupplierService[]): number | null {
  const live = services.filter(isLiveService);
  const set = live.filter((s) => typeof s.capacityDaily === "number");
  if (!set.length) return null;
  return set.reduce((sum, s) => sum + (s.capacityDaily ?? 0), 0);
}

export type DayLoad = {
  dayKey: string;
  jobCount: number;
  units: number;
};

/** Units and job counts promised per local day. */
export function loadByDay(jobs: Order[]): Map<string, DayLoad> {
  const map = new Map<string, DayLoad>();
  for (const job of jobs) {
    const when = job.promisedDate || job.deadline;
    if (!when) continue;
    const dayKey = toDayKey(when);
    if (!dayKey) continue;
    const entry = map.get(dayKey) ?? { dayKey, jobCount: 0, units: 0 };
    entry.jobCount += 1;
    entry.units += Number.isFinite(job.quantity) ? job.quantity : 0;
    map.set(dayKey, entry);
  }
  return map;
}

export type DayCapacity = {
  committedUnits: number;
  capacityUnits: number | null;
  /** True only when a capacity is set and the day is past it. */
  over: boolean;
  /** 0–1, clamped. Null when no capacity is set. */
  fraction: number | null;
};

export function capacityForDay(
  load: DayLoad | undefined,
  capacityUnits: number | null,
): DayCapacity {
  const committedUnits = load?.units ?? 0;
  if (capacityUnits == null || capacityUnits <= 0) {
    return { committedUnits, capacityUnits, over: false, fraction: null };
  }
  return {
    committedUnits,
    capacityUnits,
    over: committedUnits > capacityUnits,
    fraction: Math.min(1, committedUnits / capacityUnits),
  };
}
