import { formatPhp } from "@/lib/money";
import { shopDateLabel, shopDateTimeLabel, type ProductionChoice } from "@/lib/productionDays";

/**
 * The dates clients would see for a production time the shop has not saved
 * yet (gridgo-api `docs/SCHEDULING_API.md`, "Preview before saving").
 *
 * GRIDGO answers `{ productionTime, scheduling, calendar }`; `calendar` is the
 * same deadline calendar clients pick from. This is the only reader of it in
 * this app, and every word here is the shop web dashboard's, so a shop reads
 * the same preview on both. An estimate for an order placed now — it
 * promises nothing and reserves nothing.
 */

export type PreviewStatus = "secured" | "tight" | "rush" | "not_possible";

export type PreviewDay = {
  /** "2026-10-24", a Manila calendar day. */
  day: string;
  status: PreviewStatus;
  reason: string | null;
  readyBy: Date | null;
  /** The faster listed tier a Rush date needs, at the shop's own price. */
  rushTier: { label: string; priceMinor: number | null; surchargeMinor: number | null } | null;
};

export type ProductionTimePreview = {
  earliestReadyBy: Date | null;
  securedReadyBy: Date | null;
  days: PreviewDay[];
};

/** How many days the preview asks for: two weeks. */
export const PREVIEW_DAYS = 14;

export const PREVIEW_STATUS_LABEL: Record<PreviewStatus, string> = {
  secured: "Secured",
  tight: "Tight",
  rush: "Rush, costs more",
  not_possible: "Not offered",
};

type Raw = Record<string, unknown>;

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
}

function instant(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

function money(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** `status` when GRIDGO sent one; the older `state` otherwise, which has no Rush. */
function statusOf(day: Raw): PreviewStatus {
  switch (day.status) {
    case "secured":
    case "tight":
    case "rush":
    case "not_possible":
      return day.status;
    default:
      return day.state === "open" ? "secured" : day.state === "tight" ? "tight" : "not_possible";
  }
}

function rushTierOf(value: unknown): PreviewDay["rushTier"] {
  const tier = record(value);
  if (!tier) return null;
  return {
    label: typeof tier.label === "string" && tier.label.trim() ? tier.label : "Faster option",
    // The shop's own tier price. The `client*` figures carry GRIDGO's markup,
    // which a shop never sees.
    priceMinor: money(tier.priceMinor),
    surchargeMinor: money(tier.surchargeMinor),
  };
}

export function normalizePreview(body: unknown): ProductionTimePreview | null {
  const raw = record(body);
  const calendar = record(raw?.calendar);
  if (!raw || !calendar || !Array.isArray(calendar.days)) return null;
  const scheduling = record(raw.scheduling);
  const days = calendar.days
    .map((entry): PreviewDay | null => {
      const day = record(entry);
      if (!day || typeof day.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day.day)) return null;
      const status = statusOf(day);
      return {
        day: day.day,
        status,
        reason: typeof day.reason === "string" ? day.reason : null,
        readyBy: status === "not_possible" ? null : instant(day.readyBy),
        rushTier: status === "rush" ? rushTierOf(day.rushTier) : null,
      };
    })
    .filter((day): day is PreviewDay => day !== null);
  return {
    earliestReadyBy: instant(scheduling?.earliestReadyBy) ?? instant(calendar.earliest),
    securedReadyBy: instant(scheduling?.securedReadyBy),
    days,
  };
}

/** The query GRIDGO reads a proposed answer from. */
export function previewQuery(choice: ProductionChoice, days = PREVIEW_DAYS): Record<string, string> {
  return choice.mode === "same_day"
    ? { mode: "same_day", hours: String(choice.minutes / 60), days: String(days) }
    : { mode: "days", minDays: String(choice.minDays), maxDays: String(choice.maxDays), days: String(days) };
}

const NOT_OFFERED_REASON: Record<string, string> = {
  gridgo_closed_sunday: "GRIDGO is closed on Sundays",
  gridgo_closed: "GRIDGO is closed",
  outside_operating_hours: "Outside GRIDGO's hours",
  after_dispatch_cutoff: "After the dispatch cutoff",
  before_shortest_time: "Sooner than your shortest time",
  no_eligible_listing: "Not offered",
};

/** Why a day cannot be picked. */
export function previewReasonLine(reason: string | null): string {
  return (reason && NOT_OFFERED_REASON[reason]) || "Not offered";
}

/** "Fri 24 Oct", from a day key. */
export function previewDayLabel(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  // Noon Manila is safely inside the same calendar day on every device.
  return shopDateLabel(new Date(Date.UTC(year, month - 1, date, 4)));
}

/**
 * What else a client reads on a day: why it is not offered, or when the work
 * is ready — on a Rush day after the faster tier it needs, at the shop's price.
 */
export function previewDayDetail(day: PreviewDay): string | null {
  if (day.status === "not_possible") return previewReasonLine(day.reason);
  const ready = day.readyBy ? `Ready by ${shopDateTimeLabel(day.readyBy)}` : null;
  if (day.status !== "rush" || !day.rushTier) return ready;
  const tier = day.rushTier;
  const price =
    tier.priceMinor != null
      ? ` at ${formatPhp(tier.priceMinor)}`
      : tier.surchargeMinor != null
        ? `, ${formatPhp(tier.surchargeMinor)} more`
        : "";
  return [`Your ${tier.label} option${price}`, ready].filter(Boolean).join(". ");
}

/** Over the days: the soonest a client can have it and, for Days, when dates are Secured. */
export function previewSummary(choice: ProductionChoice, preview: ProductionTimePreview): string {
  const earliest = preview.earliestReadyBy;
  if (!earliest) return "No date in the next two weeks can be offered yet.";
  const soonest = `If a client orders now, the soonest it can be ready is ${shopDateTimeLabel(earliest)}.`;
  const secured = preview.securedReadyBy;
  if (choice.mode === "same_day" || !secured || secured.getTime() === earliest.getTime()) return soonest;
  return `${soonest} Dates from ${shopDateTimeLabel(secured)} are Secured.`;
}
