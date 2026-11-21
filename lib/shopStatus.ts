import { dayKeyDateLabel } from "@/lib/day";
import {
  manilaClock,
  normalizeShopHours,
  openingLabel,
  timeLabel,
  type DayHours,
  type ShopHours,
} from "@/lib/shopHours";

/**
 * The shop's status as My shop and the status sheet show it
 * (gridgo-api `docs/EXPRESS_API.md#my-shop-status-and-night-documents`,
 * gridgo-supplier#267).
 *
 * The only place `GET /me/shop-status` is read and its fields become words:
 * the open/closed sign, the chips under the shop's name, the To do status pill
 * and the sheet. Whether the shop is open is GRIDGO's answer (`isOpenNow`,
 * which already counts a night window); the phone never works it out from the
 * hours. A pause or a manual closure closes the night window too.
 */

export type NightJobs = "off" | "until_21" | "until_23" | "all_night";
export type PauseChoice = "one_hour" | "today";

export type NightWindow = { night: string; startsAt: string; endsAt: string };

export type ShopStatusRecord = {
  /** Shared with shop hours and the shop profile; a stale one is refused. */
  version: number;
  hours: ShopHours | null;
  /** Today's opening windows in Manila minutes; empty on a closed day. */
  todayHours: DayHours[];
  isOpenNow: boolean;
  nextOpeningAt: string | null;
  temporarilyClosed: boolean;
  expressEnabled: boolean;
  nightJobs: NightJobs;
  /** The night window running right now, or null. */
  nightWindow: NightWindow | null;
  printerDemandPings: boolean;
  /** Null when there is no pause, or it has run out. */
  pausedUntil: string | null;
};

export type ShopStatusPatch = {
  temporarilyClosed?: boolean;
  expressEnabled?: boolean;
  nightJobs?: NightJobs;
  printerDemandPings?: boolean;
  /** Null resumes a paused shop. */
  pause?: PauseChoice | null;
};

const NIGHT_MODES: readonly NightJobs[] = ["off", "until_21", "until_23", "all_night"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function minuteOf(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1440 ? value : null;
}

function isoOf(value: unknown): string | null {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

/** GRIDGO's answer, read defensively. Null when it is not a shop-status answer. */
export function normalizeShopStatus(raw: unknown): ShopStatusRecord | null {
  if (!isRecord(raw) || !Number.isInteger(raw.version)) return null;
  const hours = normalizeShopHours({ hours: raw.hours });
  const todayHours: DayHours[] = [];
  for (const row of Array.isArray(raw.todayHours) ? raw.todayHours : []) {
    if (!isRecord(row)) continue;
    const opensMinute = minuteOf(row.opensMinute);
    const closesMinute = minuteOf(row.closesMinute);
    if (opensMinute != null && closesMinute != null) todayHours.push({ opensMinute, closesMinute });
  }
  const night = isRecord(raw.nightWindow) ? raw.nightWindow : null;
  const startsAt = isoOf(night?.startsAt);
  const endsAt = isoOf(night?.endsAt);
  return {
    version: raw.version as number,
    hours,
    todayHours,
    isOpenNow: raw.isOpenNow === true,
    nextOpeningAt: isoOf(raw.nextOpeningAt),
    temporarilyClosed: hours?.temporarilyClosed === true,
    expressEnabled: raw.expressEnabled !== false,
    nightJobs: NIGHT_MODES.includes(raw.nightJobs as NightJobs) ? (raw.nightJobs as NightJobs) : "off",
    nightWindow:
      night && startsAt && endsAt && typeof night.night === "string"
        ? { night: night.night, startsAt, endsAt }
        : null,
    printerDemandPings: raw.printerDemandPings === true,
    pausedUntil: isoOf(raw.pausedUntil),
  };
}

/* ------------------------------------------------------------------ words */

/** The night-jobs choices, in the order the sheet draws them. */
export const NIGHT_CHOICES: readonly { value: NightJobs; label: string }[] = [
  { value: "off", label: "Off" },
  { value: "until_21", label: "9 PM" },
  { value: "until_23", label: "11 PM" },
  { value: "all_night", label: "All night" },
];

/** The pause choices, in the order the sheet draws them. */
export const PAUSE_CHOICES: readonly { value: PauseChoice; label: string }[] = [
  { value: "one_hour", label: "1 hour" },
  { value: "today", label: "Rest of today" },
];

/** The chip under the shop's name. Null while night jobs are off. */
export function nightChipLabel(mode: NightJobs): string | null {
  if (mode === "until_21") return "Night until 9 PM";
  if (mode === "until_23") return "Night until 11 PM";
  if (mode === "all_night") return "Night: all night";
  return null;
}

/** "8 AM", "5:30 PM": the short form a sign has room for. */
export function shortTime(minute: number): string {
  return timeLabel(minute).replace(":00 ", " ");
}

function manilaTime(iso: string): string {
  return shortTime(Math.floor(manilaClock(new Date(iso)).minute));
}

/** Whether a pause is still running at `now`. */
export function isPaused(status: Pick<ShopStatusRecord, "pausedUntil">, now: Date): boolean {
  return status.pausedUntil != null && Date.parse(status.pausedUntil) > now.getTime();
}

/** "Paused until 3:40 PM", or "Paused for the rest of today" when it runs to midnight. */
export function pauseLine(pausedUntil: string, now: Date): string {
  const until = manilaClock(new Date(pausedUntil));
  const today = manilaClock(now).dayKey;
  if (Math.floor(until.minute) === 0 && until.dayKey !== today) return "Paused for the rest of today";
  if (until.dayKey !== today) return `Paused until ${dayKeyDateLabel(until.dayKey)}, ${manilaTime(pausedUntil)}`;
  return `Paused until ${manilaTime(pausedUntil)}`;
}

/** What tapping the sign does. Staff never get a tap. */
export type SignAction = "close" | "open" | "resume" | "hours";

export type Sign = {
  open: boolean;
  /** The sign's one word. */
  word: "OPEN" | "CLOSED";
  /** Today's hours, the night window, or when it opens next. */
  line: string;
  action: SignAction;
  /** What the tap does, for screen readers and the caption under the sign. */
  actionLabel: string;
};

/** Today's hours as one range: "8 AM – 6 PM". Null on a closed day. */
export function todayRange(todayHours: DayHours[]): string | null {
  if (!todayHours.length) return null;
  const opens = Math.min(...todayHours.map((w) => w.opensMinute));
  const closes = Math.max(...todayHours.map((w) => w.closesMinute));
  return `${shortTime(opens)} – ${shortTime(closes)}`;
}

/** The hanging sign: open or closed, and the one line that goes under it. */
export function signOf(status: ShopStatusRecord, now: Date): Sign {
  if (isPaused(status, now)) {
    return {
      open: false,
      word: "CLOSED",
      line: pauseLine(status.pausedUntil as string, now),
      action: "resume",
      actionLabel: "Resume now",
    };
  }
  if (status.temporarilyClosed) {
    return {
      open: false,
      word: "CLOSED",
      line: "Closed until you open it",
      action: "open",
      actionLabel: "Open the shop",
    };
  }
  if (status.isOpenNow) {
    const line = status.nightWindow
      ? `Night jobs until ${manilaTime(status.nightWindow.endsAt)}`
      : (todayRange(status.todayHours) ?? "Open now");
    return { open: true, word: "OPEN", line, action: "close", actionLabel: "Close the shop" };
  }
  const next = status.nextOpeningAt ? openingLabel(status.nextOpeningAt, now) : null;
  return {
    open: false,
    word: "CLOSED",
    line: next ? `Opens ${next.replace(/:00 /, " ")}` : "No opening time set",
    action: "hours",
    actionLabel: "Change your hours",
  };
}

/**
 * The To do status pill: a few words saying what clients can reach right now.
 * "Paused" and "Closed" win, because nothing else matters while they hold.
 */
export function statusPillLabel(status: ShopStatusRecord, now: Date): string {
  if (isPaused(status, now)) return "Paused";
  if (status.temporarilyClosed) return "Closed";
  const express = status.expressEnabled ? "Express on" : "Express off";
  const night = status.nightJobs === "off" ? null : nightChipLabel(status.nightJobs)?.replace("Night: ", "Night ");
  return night ? `${express} · ${night.toLowerCase()}` : express;
}

/** The sentence said after a change lands, so the shop knows it took. */
export function changeSentence(patch: ShopStatusPatch): string {
  if (patch.temporarilyClosed === true) return "Your shop is closed. No new jobs until you open it.";
  if (patch.temporarilyClosed === false) return "Your shop is open again.";
  if (patch.expressEnabled === true) return "Express is on. Clients can send you Express documents.";
  if (patch.expressEnabled === false) return "Express is off. Clients cannot send you Express jobs.";
  if (patch.nightJobs === "off") return "Night jobs are off.";
  if (patch.nightJobs) {
    const label = NIGHT_CHOICES.find((c) => c.value === patch.nightJobs)?.label ?? "";
    return patch.nightJobs === "all_night"
      ? "Night jobs are on all night, after your closing time."
      : `Night jobs are on until ${label}, after your closing time.`;
  }
  if (patch.printerDemandPings === true) return "You will get a ping when clients near you need a printer.";
  if (patch.printerDemandPings === false) return "No more pings about clients who need a printer.";
  if (patch.pause === "one_hour") return "Paused for 1 hour. Jobs you already have still finish.";
  if (patch.pause === "today") return "Paused for the rest of today. Jobs you already have still finish.";
  if (patch.pause === null) return "Your shop is taking jobs again.";
  return "Saved.";
}
