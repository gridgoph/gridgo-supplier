import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { formatDeadlineFull, formatDeadlineTime } from "@/lib/dates";
import { isPlaced, type ShopPin } from "@/lib/shopLocation";

/**
 * Home printers: people who print documents from home, mostly at night
 * (gridgo-api#412, issue report 0B10F8DE, `docs/HOME_PRINTERS_API.md`).
 *
 * The only place `GET /me/home-printer` is read, the only place its `reason`
 * codes become words, and the only place the home pin's shape is built.
 *
 * Rules the screens are built on:
 *
 * - **GRIDGO's figures, not ours.** The weekly cap, the job count, the
 *   verification deadline and the hold's end are all read; nothing here
 *   hard-codes 30 jobs or 30 days. The one exception is the free give-back
 *   window (`FREE_GIVE_BACK_MS`): GRIDGO sends no field for it, so the
 *   contract's figure is named once here.
 * - **Private stays private.** The pin, street and landmark are the owner's
 *   own read; the screens say plainly that clients only see the barangay.
 * - **No blame.** A paused printer is told why and when it ends, never that
 *   it did something wrong.
 * - **An API without home printers is a fact.** `homePrintingOffered` reads
 *   `GET /settings` `homePrinter`, and sign-up hides the choice without it.
 */

export type HomeLevel = "pending" | "starter" | "verified";

export type HomeStatus = {
  level: HomeLevel;
  verified: boolean;
  online: boolean;
  offersPaused: boolean;
  /** GRIDGO's reason code, null when offers can reach the printer. */
  reason: string | null;
  /** When unverified new work stops. */
  deadlineAt: string | null;
  weeklyJobs: number;
  /** Null once Verified: no cap. */
  weeklyJobCap: number | null;
  offlineUntil: string | null;
  allowHomePickup: boolean;
  pinConsentWording: string;
  filePrivacyWording: string;
};

export type PropertyType = "house" | "boarding_house";

export type HomePinRecord = {
  point: { lat: number; lng: number; label?: string } | null;
  barangay: string;
  street: string;
  propertyType: PropertyType | null;
  landmark: string | null;
  nextChangeAt: string | null;
};

export type HomePrinterRead = {
  version: number;
  status: HomeStatus;
  pin: HomePinRecord;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

const LEVELS: readonly HomeLevel[] = ["pending", "starter", "verified"];

export function readHomeStatus(value: unknown): HomeStatus | null {
  const row = record(value);
  if (!row) return null;
  const level = LEVELS.includes(row.level as HomeLevel) ? (row.level as HomeLevel) : "pending";
  const cap = typeof row.weeklyJobCap === "number" && row.weeklyJobCap > 0 ? Math.floor(row.weeklyJobCap) : null;
  return {
    level,
    verified: row.verified === true || level === "verified",
    online: row.online === true,
    offersPaused: row.offersPaused === true,
    reason: text(row.reason),
    deadlineAt: text(row.deadlineAt),
    weeklyJobs: count(row.weeklyJobs),
    weeklyJobCap: cap,
    offlineUntil: text(row.offlineUntil),
    allowHomePickup: row.allowHomePickup === true,
    pinConsentWording: text(row.pinConsentWording) ?? "",
    filePrivacyWording: text(row.filePrivacyWording) ?? "",
  };
}

export function readHomePrinter(value: unknown): HomePrinterRead | null {
  const body = record(value);
  const status = readHomeStatus(body?.homePrinter);
  if (!body || !status) return null;
  const pin = record(body.pin) ?? {};
  const point = record(pin.point);
  const lat = point?.lat;
  const lng = point?.lng;
  return {
    version: typeof body.version === "number" ? body.version : 1,
    status,
    pin: {
      point:
        typeof lat === "number" && typeof lng === "number"
          ? { lat, lng, ...(typeof point?.label === "string" ? { label: point.label } : {}) }
          : null,
      barangay: text(pin.barangay) ?? "",
      street: text(pin.street) ?? "",
      propertyType: pin.propertyType === "house" || pin.propertyType === "boarding_house" ? pin.propertyType : null,
      landmark: text(pin.landmark),
      nextChangeAt: text(pin.nextChangeAt),
    },
  };
}

/* --------------------------------------------------------------------------
   Calls
   -------------------------------------------------------------------------- */

export type HomeRead =
  | { status: "ok"; read: HomePrinterRead }
  /** Not a home printer, Staff, or a GRIDGO without home printers. */
  | { status: "none" }
  | { status: "failed"; message: string };

export async function loadHomePrinter(): Promise<HomeRead> {
  try {
    const read = readHomePrinter(await api.getHomePrinter());
    return read ? { status: "ok", read } : { status: "none" };
  } catch (error) {
    if (error instanceof api.ApiError && [403, 404, 405].includes(error.status)) return { status: "none" };
    return { status: "failed", message: humanizeApiError(error, offlineMessage("load your home printing")) };
  }
}

export type HomeWrite = { status: "ok"; read: HomePrinterRead } | { status: "failed"; message: string; code: string | null };

function errorCode(error: unknown): string | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = record(error.body);
  return typeof body?.error === "string" ? body.error : null;
}

/**
 * One `PATCH /me/home-printer`. A stale version reads again and tries once
 * more: every change here is a replace, so the retry cannot double anything.
 */
export async function updateHomePrinter(
  version: number,
  change: Record<string, unknown>,
  fallback: string,
): Promise<HomeWrite> {
  const attempt = async (expectedVersion: number) => {
    const read = readHomePrinter(await api.patchHomePrinter({ expectedVersion, ...change }));
    if (!read) throw new Error("unreadable");
    return read;
  };
  try {
    return { status: "ok", read: await attempt(version) };
  } catch (error) {
    if (errorCode(error) === "shop_profile_stale") {
      const again = await loadHomePrinter();
      if (again.status === "ok") {
        try {
          return { status: "ok", read: await attempt(again.read.version) };
        } catch (inner) {
          return { status: "failed", message: humanizeApiError(inner, offlineMessage(fallback)), code: errorCode(inner) };
        }
      }
    }
    return { status: "failed", message: humanizeApiError(error, offlineMessage(fallback)), code: errorCode(error) };
  }
}

export type HomeOffer = "offered" | "not_offered" | "unknown";

/**
 * Whether this GRIDGO offers home printing (`GET /settings` `homePrinter`).
 * GRIDGO answers that read only to an enrolled account, so before sign-up
 * the answer is usually `unknown`; sign-up then learns it from the first
 * save (`homeKindHonoured`) and hides the choice if GRIDGO did not take it.
 */
export async function homePrintingOffered(): Promise<HomeOffer> {
  try {
    return (await api.getHomePrinterOffered()) ? "offered" : "not_offered";
  } catch {
    return "unknown";
  }
}

/**
 * After step 0 is saved as a home printer: GRIDGO that takes home printers
 * answers with the home pin consent instead of the shop's location consent.
 * The same wording before and after means this GRIDGO does not have them.
 */
export function homeKindHonoured(wordingBefore: string, wordingAfter: string): boolean {
  return !wordingBefore || wordingBefore !== wordingAfter;
}

export const HOME_NOT_OPEN_YET =
  "Printing from home is not open on GRIDGO yet. You can set up a print shop now, or come back soon.";

/* --------------------------------------------------------------------------
   Online, and why offers paused
   -------------------------------------------------------------------------- */

export type HomeSwitch = {
  /** What the big switch shows. */
  on: boolean;
  /** The switch can be flipped by the printer right now. */
  canToggle: boolean;
  tone: "online" | "offline" | "paused";
  title: string;
  body: string;
  /** A screen that clears the reason, when the printer can act on it. */
  action: { label: string; target: "levels" | "pin" } | null;
};

function until(iso: string | null): string {
  const full = formatDeadlineFull(iso);
  return full === "Not set" ? "" : full;
}

/**
 * The To do switch in words. `reason` is GRIDGO's; the switch reads
 * `online` and lets the printer turn it on only when nothing but the switch
 * itself is in the way (and a location fix, which turning on sends).
 */
export function homeSwitch(status: HomeStatus): HomeSwitch {
  const r = status.reason;
  if (!r) {
    return {
      on: true,
      canToggle: true,
      tone: "online",
      title: "You're online",
      body: "New Express jobs can reach you. Turn this off when you stop printing.",
      action: null,
    };
  }
  // Offline, GRIDGO has no recent fix to measure, so it may say "away": the switch is the answer.
  if (r === "home_offline" || (r === "home_away_from_pin" && !status.online)) {
    return {
      on: false,
      canToggle: true,
      tone: "offline",
      title: "You're offline",
      body: "Turn this on when you are home and ready to print.",
      action: null,
    };
  }
  if (r === "home_away_from_pin") {
    return {
      on: status.online,
      canToggle: true,
      tone: "paused",
      title: "Offers paused: you're away from home",
      body: "Offers start again by themselves when you're back near your home pin. Jobs you accepted carry on.",
      action: null,
    };
  }
  if (r === "home_fair_play_hold") {
    const end = until(status.offlineUntil);
    return {
      on: false,
      canToggle: false,
      tone: "paused",
      title: end ? `Offers paused until ${end}` : "Offers paused for a day",
      body: "Three jobs were given back late this week, so offers rest for a day. Turn the switch on again after that.",
      action: null,
    };
  }
  if (r === "home_weekly_cap") {
    return {
      on: status.online,
      canToggle: false,
      tone: "paused",
      title: "You reached this week's jobs",
      body: "Starter printers take a set number of jobs in seven days. Offers come back as older jobs pass a week, or get Verified for no limit.",
      action: { label: "Get Verified", target: "levels" },
    };
  }
  if (r === "home_verification_deadline") {
    return {
      on: false,
      canToggle: false,
      tone: "paused",
      title: "New jobs stopped until you're Verified",
      body: "Your time to get Verified ended. Jobs you accepted still finish. Send your papers to start again.",
      action: { label: "Get Verified", target: "levels" },
    };
  }
  if (r === "home_pin_consent_required") {
    return {
      on: false,
      canToggle: false,
      tone: "offline",
      title: "Set your home pin",
      body: "GRIDGO needs your home pin and your OK on how it is shared before offers can start.",
      action: { label: "Set your home pin", target: "pin" },
    };
  }
  if (r === "home_starter_revoked") {
    return {
      on: false,
      canToggle: false,
      tone: "paused",
      title: "GRIDGO is reviewing your Starter level",
      body: "Offers start again once Operations reviews it. Jobs you accepted carry on.",
      action: null,
    };
  }
  // `home_file_privacy_required`, `home_starter_review_required`, and anything newer.
  return {
    on: false,
    canToggle: false,
    tone: "offline",
    title: "Finish Starter to go online",
    body: "A few quick steps, then GRIDGO checks them. You can go online once you're a Starter.",
    action: { label: "Finish Starter", target: "levels" },
  };
}

/** "12 of 30 jobs this week", or null once Verified (no cap). */
export function weeklyJobsLine(status: HomeStatus): string | null {
  if (status.weeklyJobCap == null) return null;
  return `${Math.min(status.weeklyJobs, status.weeklyJobCap)} of ${status.weeklyJobCap} jobs this week`;
}

/** The share of the week's cap used, 0–1. */
export function weeklyJobsShare(status: HomeStatus): number {
  if (!status.weeklyJobCap) return 0;
  return Math.min(1, status.weeklyJobs / status.weeklyJobCap);
}

/** One line for a level badge: "Starter", "Verified", or "Not a Starter yet". */
export function levelLabel(level: HomeLevel): string {
  return level === "verified" ? "Verified" : level === "starter" ? "Starter" : "Getting started";
}

/* --------------------------------------------------------------------------
   Levels: what is left
   -------------------------------------------------------------------------- */

export type HomePaper = "valid_id" | "id_selfie" | "sample_work" | "barangay_clearance" | "business_permit" | "tin";

export const STARTER_PAPERS: readonly { paper: HomePaper; title: string; detail: string }[] = [
  { paper: "valid_id", title: "Your ID", detail: "A government ID that shows you are 18 or older" },
  { paper: "id_selfie", title: "Selfie with your ID", detail: "Hold the ID next to your face" },
  { paper: "sample_work", title: "Test print", detail: "Print any page at home and take a photo of it" },
];

export const VERIFIED_PAPERS: readonly { paper: HomePaper; title: string; detail: string }[] = [
  { paper: "barangay_clearance", title: "Barangay clearance", detail: "Or a DTI business permit instead" },
  { paper: "business_permit", title: "DTI business permit", detail: "Or a barangay clearance instead" },
  { paper: "tin", title: "TIN", detail: "Your TIN card or a BIR form showing it" },
];

const HOME_PAPERS: readonly HomePaper[] = [...STARTER_PAPERS, ...VERIFIED_PAPERS].map((p) => p.paper);

/** Which papers GRIDGO has, from `GET /me/supplier-verification` `verificationDocuments`. */
export function homePapersOnFile(documents: unknown): Set<HomePaper> {
  const out = new Set<HomePaper>();
  if (!Array.isArray(documents)) return out;
  for (const value of documents) {
    const row = record(value);
    if (!row) continue;
    const refs = Array.isArray(row.references) ? row.references.map(record) : [];
    const type = row.verificationDocumentType ?? row.documentType ?? refs.find((ref) => ref?.documentType)?.documentType;
    if (HOME_PAPERS.includes(type as HomePaper)) out.add(type as HomePaper);
  }
  return out;
}

export type StarterStep = {
  id: "privacy" | HomePaper;
  title: string;
  detail: string;
  done: boolean;
};

/**
 * Starter as a checklist. The agreement is done when GRIDGO stopped asking for
 * it: the reason has moved past `home_file_privacy_required`, or the printer
 * is already a Starter.
 */
export function starterSteps(status: HomeStatus, onFile: Set<HomePaper>, agreedNow = false): StarterStep[] {
  const agreed =
    agreedNow ||
    status.level !== "pending" ||
    (status.reason !== "home_file_privacy_required" && status.reason !== "home_pin_consent_required");
  return [
    {
      id: "privacy",
      title: "Keep client files private",
      detail: "Agree to use files only to print, then delete them",
      done: agreed,
    },
    ...STARTER_PAPERS.map((p) => ({ ...p, id: p.paper, done: status.level !== "pending" || onFile.has(p.paper) })),
  ];
}

/** Every Starter step is in and GRIDGO has not answered yet. */
export function starterWaiting(status: HomeStatus, steps: StarterStep[]): boolean {
  return status.level === "pending" && steps.every((step) => step.done);
}

/** "3 steps left · about 2 min" for the checklist header. */
export function stepsLeftLine(steps: StarterStep[]): string {
  const left = steps.filter((step) => !step.done).length;
  if (!left) return "All sent";
  return left === 1 ? "1 step left" : `${left} steps left`;
}

/** Verified needs a clearance or permit, plus a TIN. */
export function verifiedMissing(onFile: Set<HomePaper>): { permit: boolean; tin: boolean } {
  return {
    permit: !onFile.has("barangay_clearance") && !onFile.has("business_permit"),
    tin: !onFile.has("tin"),
  };
}

/** "Get Verified by Mon, Dec 21" — GRIDGO's deadline for new work, or null. */
export function verifyByLine(status: HomeStatus): string | null {
  if (status.verified || !status.deadlineAt) return null;
  const at = until(status.deadlineAt);
  return at ? `Get Verified by ${at} to keep getting new jobs.` : null;
}

/* --------------------------------------------------------------------------
   Give-back
   -------------------------------------------------------------------------- */

/**
 * How long after accepting a job goes back for free
 * (`docs/HOME_PRINTERS_API.md` §9, "exactly five minutes ... is still free").
 * GRIDGO sends no field for it, so it is named once, here.
 */
export const FREE_GIVE_BACK_MS = 5 * 60 * 1000;

export type GiveBackWindow = { free: boolean; freeUntil: Date | null };

export function giveBackWindow(job: Pick<api.Order, "shopAcceptance">, now: Date = new Date()): GiveBackWindow {
  const accepted = job.shopAcceptance?.acceptedAt ? Date.parse(job.shopAcceptance.acceptedAt) : Number.NaN;
  if (!Number.isFinite(accepted)) return { free: false, freeUntil: null };
  const freeUntil = new Date(accepted + FREE_GIVE_BACK_MS);
  return { free: now.getTime() <= freeUntil.getTime(), freeUntil };
}

/** The line under "Give it back". */
export function giveBackLine(window: GiveBackWindow): string {
  if (window.free && window.freeUntil) return `Free until ${formatDeadlineTime(window.freeUntil.toISOString())}`;
  return "Counts as a late give-back";
}

/** A home Express job the printer can still hand on (`home_give_back_unavailable` otherwise). */
export function canGiveBack(job: Pick<api.Order, "state" | "shopAcceptance">): boolean {
  return (
    job.shopAcceptance?.status === "accepted" &&
    ["payment_authorized", "production", "supplier_self_qc"].includes(job.state)
  );
}

/* --------------------------------------------------------------------------
   The home pin form (sign-up's pin step and a later move)
   -------------------------------------------------------------------------- */

export type HomePinDraft = {
  pin: ShopPin | null;
  barangay: string;
  street: string;
  propertyType: PropertyType | null;
  landmark: string;
};

export const EMPTY_HOME_PIN: HomePinDraft = { pin: null, barangay: "", street: "", propertyType: null, landmark: "" };

export const PROPERTY_OPTIONS = [
  { value: "house", label: "House" },
  { value: "boarding_house", label: "Boarding house" },
] as const;

export type HomePinProblems = Partial<Record<"pin" | "barangay" | "street" | "propertyType" | "consent", string>>;

export function homePinProblems(draft: HomePinDraft, consented: boolean): HomePinProblems {
  const problems: HomePinProblems = {};
  if (!isPlaced(draft.pin)) problems.pin = "Tap the map where you live.";
  if (!draft.barangay.trim()) problems.barangay = "Enter your barangay.";
  if (!draft.street.trim()) problems.street = "Enter your street.";
  if (!draft.propertyType) problems.propertyType = "Choose house or boarding house.";
  if (!consented) problems.consent = "Tick the box to continue.";
  return problems;
}

/** The location step / pin move as GRIDGO takes it. Null until it is complete. */
export function homePinValue(draft: HomePinDraft, wording: string): Record<string, unknown> | null {
  if (!isPlaced(draft.pin) || !draft.propertyType || !draft.barangay.trim() || !draft.street.trim() || !wording) {
    return null;
  }
  return {
    point: { lat: draft.pin.lat, lng: draft.pin.lng },
    barangay: draft.barangay.trim(),
    street: draft.street.trim(),
    propertyType: draft.propertyType,
    ...(draft.landmark.trim() ? { landmark: draft.landmark.trim() } : {}),
    consent: { accepted: true, wording },
  };
}

/** The saved pin back into the form. */
export function homePinDraftFrom(saved: Partial<HomePinRecord> & { point?: { lat: number; lng: number; label?: string } | null } | null | undefined): HomePinDraft {
  if (!saved) return EMPTY_HOME_PIN;
  const point = saved.point;
  return {
    pin: point ? { lat: point.lat, lng: point.lng, label: point.label ?? saved.street ?? "" } : null,
    barangay: saved.barangay ?? "",
    street: saved.street ?? "",
    propertyType: saved.propertyType ?? null,
    landmark: saved.landmark ?? "",
  };
}

/** "You can move your pin again on Dec 24", or null when it can move now. */
export function nextPinChangeLine(pin: HomePinRecord, now: Date = new Date()): string | null {
  if (!pin.nextChangeAt) return null;
  const at = Date.parse(pin.nextChangeAt);
  if (!Number.isFinite(at) || at <= now.getTime()) return null;
  const day = new Date(at).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  return `You can move your pin again on ${day}.`;
}

/** Home printers print documents only, on GRIDGO's standard papers. */
export const HOME_PAPERS_ALLOWED = ["short", "a4", "long"] as const;
