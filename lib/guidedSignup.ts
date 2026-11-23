import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { formatPhp, parseMoney } from "@/lib/money";
import { isPhoneish } from "@/lib/onboardingSteps";
import { isPlaced, pinProblem, type ShopPin } from "@/lib/shopLocation";

/**
 * Guided sign-up for a document shop (gridgo-supplier#265, gridgo-api
 * `docs/SUPPLIER_SIGNUP_API.md`).
 *
 * The only place the sign-up draft, its `nextStep` and GRIDGO's wording are
 * read, and the only place a mission becomes a title, a time and a state.
 *
 * Three rules the screens are built on:
 *
 * - **GRIDGO decides what is done.** `nextStep` is the first unfinished step
 *   in GRIDGO's order, not the order the missions are drawn in, so a mission
 *   is done because the draft or the shop says so — never because a screen
 *   was visited.
 * - **GRIDGO's words, not ours.** The location and payout consent are sent
 *   back exactly as GRIDGO wrote them, the print groups are GRIDGO's list and
 *   the per-page price is GRIDGO's schedule. Nothing here hard-codes a price.
 * - **A server without the guided flow is a fact, not an error.** A 404 or
 *   405 is `not_open_yet`, and apply falls back to the older four steps.
 */

/* --------------------------------------------------------------------------
   Shapes
   -------------------------------------------------------------------------- */

export type ShopKind = "print_shop" | "home_printer";
export type RegistrantRole = "owner" | "manager";
export type Paper = "short" | "a4" | "long" | "a3";
export type Colour = "bw" | "colour";
export type Finishing = "stapling" | "binding" | "photo_paper";

/** GRIDGO's order: `eligibility → shop → location → prints → enroll`, then the shop's own. */
export type SignupNextStep =
  | "eligibility"
  | "shop"
  | "location"
  | "prints"
  | "enroll"
  | "hours"
  | "team"
  | "owner_claim"
  | "payout"
  | "listing_photos"
  | "complete";

export type DocumentChoices = {
  papers: Paper[];
  colours: Colour[];
  duplex: boolean;
  a3PricesMinor?: Partial<Record<Colour, number>>;
  finishing?: Partial<Record<Finishing, number>>;
};

export type SignupSteps = {
  eligibility?: { shopKind: ShopKind; registrantRole: RegistrantRole; adult: boolean };
  shop?: { shopName: string; contactName: string; phone: string; ownerPhone?: string };
  location?: { point: { lat: number; lng: number; label: string } };
  prints?: { groups: string[]; documents?: DocumentChoices };
  ownerClaim?: { status: string };
};

export type GuidedSignup = {
  version: number;
  supplierId: string | null;
  steps: SignupSteps;
  nextStep: SignupNextStep;
};

/** What GRIDGO hands every sign-up read beside the draft. */
export type SignupTerms = {
  printGroups: string[];
  locationConsentWording: string;
  payoutConsentWording: string;
  documentRates: { bwMinor: number; colourMinor: number };
};

export type PayoutStatus = {
  held: boolean;
  reason: string | null;
  ownerClaimRequired: boolean;
  pausedUntil: string | null;
};

const NEXT_STEPS: readonly SignupNextStep[] = [
  "eligibility",
  "shop",
  "location",
  "prints",
  "enroll",
  "hours",
  "team",
  "owner_claim",
  "payout",
  "listing_photos",
  "complete",
];

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function minor(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function readSignup(value: unknown): GuidedSignup | null {
  const row = record(value);
  if (!row) return null;
  const steps = record(row.steps) ?? {};
  const next = NEXT_STEPS.includes(row.nextStep as SignupNextStep)
    ? (row.nextStep as SignupNextStep)
    : "eligibility";
  return {
    version: typeof row.version === "number" ? row.version : 0,
    supplierId: typeof row.supplierId === "string" ? row.supplierId : null,
    steps: steps as SignupSteps,
    nextStep: next,
  };
}

export function readTerms(value: unknown): SignupTerms | null {
  const row = record(value);
  if (!row) return null;
  const rates = record(row.documentRates);
  const groups = Array.isArray(row.printGroups)
    ? row.printGroups.filter((group): group is string => typeof group === "string")
    : [];
  const bwMinor = minor(rates?.bwMinor);
  const colourMinor = minor(rates?.colourMinor);
  if (!groups.length || !bwMinor || !colourMinor) return null;
  return {
    printGroups: groups,
    locationConsentWording: text(row.locationConsentWording),
    payoutConsentWording: text(row.payoutConsentWording),
    documentRates: { bwMinor, colourMinor },
  };
}

export function readPayoutStatus(value: unknown): PayoutStatus | null {
  const row = record(value);
  if (!row) return null;
  return {
    held: row.held === true,
    reason: typeof row.reason === "string" ? row.reason : null,
    ownerClaimRequired: row.ownerClaimRequired === true,
    pausedUntil: typeof row.pausedUntil === "string" ? row.pausedUntil : null,
  };
}

/* --------------------------------------------------------------------------
   Calls
   -------------------------------------------------------------------------- */

export type SignupRead =
  | { status: "ok"; signup: GuidedSignup; terms: SignupTerms }
  /** This GRIDGO has no guided sign-up: apply uses the older steps. */
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

function routeAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

function errorCode(error: unknown): string | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = record(error.body);
  return typeof body?.error === "string" ? body.error : null;
}

function errorField(error: unknown): string | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = record(error.body);
  return typeof body?.field === "string" ? body.field : null;
}

function readResponse(raw: unknown): SignupRead {
  const body = record(raw);
  const signup = readSignup(body?.signup);
  const terms = readTerms(body);
  if (!signup || !terms) return { status: "not_open_yet" };
  return { status: "ok", signup, terms };
}

export async function loadGuidedSignup(): Promise<SignupRead> {
  try {
    return readResponse(await api.getGuidedSignup());
  } catch (error) {
    if (routeAbsent(error)) return { status: "not_open_yet" };
    return { status: "failed", message: humanizeApiError(error, offlineMessage("load your sign-up")) };
  }
}

export type StepSave =
  | { status: "ok"; signup: GuidedSignup; terms: SignupTerms }
  | { status: "stale" }
  /** The shop was opened since: this draft is done, carry on in the shop. */
  | { status: "enrolled" }
  | { status: "failed"; message: string; field?: string };

/** Sentences for the refusals a shop can fix, by the field GRIDGO named. */
const STEP_REFUSALS: Record<string, string> = {
  shop_mobile_verification_required: "Confirm your mobile number with the code we text you first.",
  supplier_signup_restart_required:
    "You already chose owner or manager. To change it, ask Operations to restart your sign-up.",
  supplier_signup_step_required: "Finish the earlier steps first.",
  ownerPhone: "Enter your owner's mobile number. It must be different from yours.",
  phone: "Enter a Philippine mobile number, like 0917 123 4567.",
  shopName: "Enter your shop's name.",
  contactName: "Enter your name.",
  point: "Place your shop on the map.",
  label: "Place your shop on the map.",
  consent: "Tick the location consent to continue.",
  groups: "Choose at least one thing your shop prints.",
  eligibility: "Answer all three questions to continue.",
};

export async function saveSignupStep(
  version: number,
  step: "eligibility" | "shop" | "location" | "prints",
  value: Record<string, unknown>,
): Promise<StepSave> {
  try {
    const read = readResponse(await api.saveGuidedSignupStep(version, step, value));
    if (read.status !== "ok") return { status: "failed", message: "GRIDGO did not save that step. Try again." };
    return read;
  } catch (error) {
    const code = errorCode(error);
    if (code === "supplier_signup_stale") return { status: "stale" };
    if (code === "supplier_signup_enrolled") return { status: "enrolled" };
    const field = errorField(error);
    const sentence = (code && STEP_REFUSALS[code]) ?? (field && STEP_REFUSALS[field]) ?? null;
    if (sentence) return { status: "failed", message: sentence, ...(field ? { field } : {}) };
    return {
      status: "failed",
      message: humanizeApiError(error, offlineMessage("save this step")),
    };
  }
}

export type ShopSignupRead =
  | { status: "ok"; signup: GuidedSignup | null; payoutStatus: PayoutStatus | null }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/** `GET /me/supplier-signup`. A shop that did not use guided sign-up reads `signup: null`. */
export async function loadShopSignup(): Promise<ShopSignupRead> {
  try {
    const body = record(await api.getMySupplierSignup());
    const signup = readSignup(body?.signup);
    return {
      status: "ok",
      signup: signup && signup.supplierId ? signup : null,
      payoutStatus: readPayoutStatus(body?.payoutStatus),
    };
  } catch (error) {
    if (routeAbsent(error)) return { status: "not_open_yet" };
    return { status: "failed", message: humanizeApiError(error, offlineMessage("load your setup")) };
  }
}

/* --------------------------------------------------------------------------
   Step 0
   -------------------------------------------------------------------------- */

export type Eligibility = {
  shopKind: ShopKind | null;
  registrantRole: RegistrantRole | null;
  adult: boolean;
};

export const EMPTY_ELIGIBILITY: Eligibility = { shopKind: null, registrantRole: null, adult: false };

export const SHOP_KIND_OPTIONS = [
  { value: "print_shop", label: "Print shop", detail: "Imprentahan nga tindahan" },
  { value: "home_printer", label: "Home printer", detail: "Nag-print sa balay" },
] as const;

export const ROLE_OPTIONS = [
  { value: "owner", label: "I own the shop", detail: "Ako ang tag-iya" },
  { value: "manager", label: "I manage it for the owner", detail: "Ako ang nagdumala" },
] as const;

export function eligibilityProblems(value: Eligibility): Partial<Record<keyof Eligibility, string>> {
  const problems: Partial<Record<keyof Eligibility, string>> = {};
  if (!value.shopKind) problems.shopKind = "Choose where you print.";
  if (!value.registrantRole) problems.registrantRole = "Choose owner or manager.";
  if (!value.adult) problems.adult = "You must be 18 or older to open a shop on GRIDGO.";
  return problems;
}

export function eligibilityValue(value: Eligibility): Record<string, unknown> | null {
  if (!value.shopKind || !value.registrantRole || !value.adult) return null;
  return { shopKind: value.shopKind, registrantRole: value.registrantRole, adult: true };
}

/* --------------------------------------------------------------------------
   Your shop
   -------------------------------------------------------------------------- */

/**
 * `+639XXXXXXXXX`, the form GRIDGO stores and Clerk compares. `null` when the
 * typed number is not a Philippine mobile.
 */
export function philippineMobile(value: string): string | null {
  const digits = value.replace(/[^0-9]/g, "");
  const local = digits.startsWith("63") ? digits.slice(2) : digits.startsWith("0") ? digits.slice(1) : digits;
  return /^9\d{9}$/.test(local) ? `+63${local}` : null;
}

export type ShopFields = {
  shopName: string;
  contactName: string;
  phone: string;
  ownerPhone: string;
};

export function shopProblems(
  fields: ShopFields,
  options: { manager: boolean; phoneConfirmed: boolean },
): Partial<Record<keyof ShopFields, string>> {
  const problems: Partial<Record<keyof ShopFields, string>> = {};
  if (!fields.shopName.trim()) problems.shopName = "Enter your shop's name.";
  if (!fields.contactName.trim()) problems.contactName = "Enter your name.";
  const mobile = philippineMobile(fields.phone);
  if (!mobile) problems.phone = "Enter a mobile number like 0917 123 4567.";
  else if (!options.phoneConfirmed) problems.phone = "Confirm this number with the code we text you.";
  if (options.manager) {
    const owner = philippineMobile(fields.ownerPhone);
    if (!owner) problems.ownerPhone = "Enter your owner's mobile number, like 0917 123 4567.";
    else if (owner === mobile) problems.ownerPhone = "Your owner's number must be different from yours.";
  }
  return problems;
}

export function shopValue(fields: ShopFields, manager: boolean): Record<string, unknown> {
  return {
    shopName: fields.shopName.trim(),
    contactName: fields.contactName.trim(),
    phone: philippineMobile(fields.phone) ?? fields.phone.trim(),
    ...(manager ? { ownerPhone: philippineMobile(fields.ownerPhone) ?? fields.ownerPhone.trim() } : {}),
  };
}

/** Kept loose on purpose: the step only needs a typo check, GRIDGO decides. */
export function looksLikeMobile(value: string): boolean {
  return isPhoneish(value) && philippineMobile(value) !== null;
}

/* --------------------------------------------------------------------------
   Pin
   -------------------------------------------------------------------------- */

export function pinStepProblem(pin: ShopPin | null, consented: boolean): string | null {
  const problem = pinProblem(pin, pin?.label ?? "");
  if (problem) return problem;
  if (!consented) return "Tick the box to let GRIDGO use your pin.";
  return null;
}

export function locationValue(pin: ShopPin, wording: string): Record<string, unknown> | null {
  if (!isPlaced(pin) || !pin.label.trim()) return null;
  return {
    point: { lat: pin.lat, lng: pin.lng, label: pin.label.trim() },
    consent: { accepted: true, wording },
  };
}

/* --------------------------------------------------------------------------
   What the shop prints
   -------------------------------------------------------------------------- */

/** Words for GRIDGO's print-group codes. An unknown code still gets a readable name. */
const GROUP_LABELS: Record<string, { label: string; detail: string }> = {
  documents: { label: "Documents", detail: "Prints, photocopies, school and office papers" },
  marketing: { label: "Marketing prints", detail: "Flyers, cards, brochures, stickers" },
  banners_signage: { label: "Banners and signs", detail: "Tarpaulins, standees, signage" },
  apparel: { label: "Shirts and apparel", detail: "Shirt printing, caps, uniforms" },
  merchandise: { label: "Merchandise", detail: "Mugs, keychains, giveaways" },
  awards: { label: "Awards", detail: "Plaques, certificates, medals" },
  construction: { label: "Plans and blueprints", detail: "Large-format plans and drawings" },
  packaging: { label: "Packaging", detail: "Boxes, labels, bags" },
};

export function groupLabel(code: string): { label: string; detail: string | null } {
  const known = GROUP_LABELS[code];
  if (known) return known;
  const words = code.replace(/_/g, " ");
  return { label: words.charAt(0).toUpperCase() + words.slice(1), detail: null };
}

/** Documents first, then GRIDGO's own order for the rest. */
export function orderedGroups(groups: string[]): string[] {
  return [...groups].sort((a, b) => (a === "documents" ? -1 : b === "documents" ? 1 : 0));
}

export const PAPERS: readonly { value: Paper; label: string }[] = [
  { value: "short", label: "Short" },
  { value: "a4", label: "A4" },
  { value: "long", label: "Long" },
  { value: "a3", label: "A3" },
];

export const COLOURS: readonly { value: Colour; label: string }[] = [
  { value: "bw", label: "Black & white" },
  { value: "colour", label: "Colour" },
];

export const FINISHING: readonly { value: Finishing; label: string; unit: string }[] = [
  { value: "stapling", label: "Stapling", unit: "per set" },
  { value: "binding", label: "Binding", unit: "per book" },
  { value: "photo_paper", label: "Photo paper", unit: "per page" },
];

/** What the shop ticked, with prices still as typed. */
export type PrintsDraft = {
  groups: string[];
  papers: Paper[];
  colours: Colour[];
  duplex: boolean;
  a3Prices: Record<Colour, string>;
  finishing: Record<Finishing, string>;
};

/** The defaults are the common document shop: every standard paper, both colours, back-to-back. */
export const DEFAULT_PRINTS: PrintsDraft = {
  groups: ["documents"],
  papers: ["short", "a4", "long"],
  colours: ["bw", "colour"],
  duplex: true,
  a3Prices: { bw: "", colour: "" },
  finishing: { stapling: "", binding: "", photo_paper: "" },
};

function moneyText(value: number | undefined): string {
  return value ? String(value / 100) : "";
}

/** A saved prints step back into the screen's draft, for resume. */
export function printsDraftFrom(saved: SignupSteps["prints"] | undefined): PrintsDraft {
  if (!saved) return DEFAULT_PRINTS;
  const docs = saved.documents;
  return {
    groups: saved.groups.length ? saved.groups : DEFAULT_PRINTS.groups,
    papers: docs?.papers?.length ? docs.papers : DEFAULT_PRINTS.papers,
    colours: docs?.colours?.length ? docs.colours : DEFAULT_PRINTS.colours,
    duplex: docs ? Boolean(docs.duplex) : true,
    a3Prices: { bw: moneyText(docs?.a3PricesMinor?.bw), colour: moneyText(docs?.a3PricesMinor?.colour) },
    finishing: {
      stapling: moneyText(docs?.finishing?.stapling),
      binding: moneyText(docs?.finishing?.binding),
      photo_paper: moneyText(docs?.finishing?.photo_paper),
    },
  };
}

export type PrintsProblems = Partial<{
  groups: string;
  papers: string;
  colours: string;
  a3: Partial<Record<Colour, string>>;
  finishing: Partial<Record<Finishing, string>>;
}>;

function positiveMinor(value: string): number | null {
  const parsed = parseMoney(value);
  return parsed.ok && parsed.minor !== null && parsed.minor > 0 ? parsed.minor : null;
}

export function printsProblems(draft: PrintsDraft): PrintsProblems {
  const problems: PrintsProblems = {};
  if (!draft.groups.length) problems.groups = "Choose at least one thing your shop prints.";
  if (!draft.groups.includes("documents")) return problems;
  if (!draft.papers.length) problems.papers = "Tick at least one paper size.";
  if (!draft.colours.length) problems.colours = "Tick black & white, colour, or both.";
  if (draft.papers.includes("a3")) {
    const a3: Partial<Record<Colour, string>> = {};
    for (const colour of draft.colours) {
      if (!positiveMinor(draft.a3Prices[colour])) a3[colour] = "Set your A3 price per side.";
    }
    if (Object.keys(a3).length) problems.a3 = a3;
  }
  const finishing: Partial<Record<Finishing, string>> = {};
  for (const item of FINISHING) {
    const typed = draft.finishing[item.value].trim();
    if (typed && !positiveMinor(typed)) finishing[item.value] = "Enter a price above ₱0, or leave it empty.";
  }
  if (Object.keys(finishing).length) problems.finishing = finishing;
  return problems;
}

export function hasPrintsProblems(problems: PrintsProblems): boolean {
  return Object.keys(problems).length > 0;
}

export function printsValue(draft: PrintsDraft): Record<string, unknown> {
  const groups = orderedGroups([...new Set(draft.groups)]);
  if (!groups.includes("documents")) return { groups };
  const papers = PAPERS.map((p) => p.value).filter((paper) => draft.papers.includes(paper));
  const colours = COLOURS.map((c) => c.value).filter((colour) => draft.colours.includes(colour));
  const documents: Record<string, unknown> = { papers, colours, duplex: draft.duplex };
  if (papers.includes("a3")) {
    const prices: Partial<Record<Colour, number>> = {};
    for (const colour of colours) {
      const price = positiveMinor(draft.a3Prices[colour]);
      if (price) prices[colour] = price;
    }
    documents.a3PricesMinor = prices;
  }
  const finishing: Partial<Record<Finishing, number>> = {};
  for (const item of FINISHING) {
    const price = positiveMinor(draft.finishing[item.value]);
    if (price) finishing[item.value] = price;
  }
  if (Object.keys(finishing).length) documents.finishing = finishing;
  return { groups, documents };
}

/** "₱3.00 a side" — GRIDGO's fixed page price, read-only in this flow. */
export function pagePriceLine(terms: SignupTerms, colour: Colour): string {
  const value = colour === "bw" ? terms.documentRates.bwMinor : terms.documentRates.colourMinor;
  return `${formatPhp(value)} a side`;
}

/* --------------------------------------------------------------------------
   Missions
   -------------------------------------------------------------------------- */

export type MissionId = "shop" | "pin" | "prints" | "staff" | "hours" | "paid" | "verify";
export type MissionState = "done" | "current" | "later" | "waiting";

export type Mission = {
  id: MissionId;
  title: string;
  /** Bisaya, under the title. */
  local: string;
  minutes: number;
  optional?: boolean;
};

export const MISSIONS: readonly Mission[] = [
  { id: "shop", title: "Your shop", local: "Imong tindahan", minutes: 1 },
  { id: "pin", title: "Pin your shop", local: "Asa ka", minutes: 1 },
  { id: "prints", title: "What you print", local: "Unsa imong i-print", minutes: 1 },
  { id: "staff", title: "Who takes jobs", local: "Kinsa modawat", minutes: 0.5 },
  { id: "hours", title: "Your hours", local: "Oras sa tindahan", minutes: 1 },
  { id: "paid", title: "Get paid and alerts", local: "Bayad ug pahibalo", minutes: 0.5 },
  { id: "verify", title: "Verify your shop", local: "I-verify ang tindahan", minutes: 2, optional: true },
];

export const REQUIRED_MISSIONS = MISSIONS.filter((mission) => !mission.optional);

const AFTER_ENROLL: readonly SignupNextStep[] = [
  "hours",
  "team",
  "owner_claim",
  "payout",
  "listing_photos",
  "complete",
];

function past(next: SignupNextStep, step: SignupNextStep): boolean {
  return NEXT_STEPS.indexOf(next) > NEXT_STEPS.indexOf(step);
}

/**
 * Whether each required mission is done, from GRIDGO's own record.
 *
 * Before enrollment the draft's saved steps decide; after it, `nextStep`
 * does. `owner_claim` is a manager's shop waiting for its owner: payouts are
 * the owner's to set, so the last mission reads "waiting", not "current".
 */
export function missionDone(signup: GuidedSignup | null, id: MissionId): boolean {
  if (!signup) return false;
  const enrolled = Boolean(signup.supplierId) || AFTER_ENROLL.includes(signup.nextStep);
  switch (id) {
    case "shop":
      return Boolean(signup.steps.shop) || enrolled;
    case "pin":
      return Boolean(signup.steps.location) || enrolled;
    case "prints":
      return Boolean(signup.steps.prints) || enrolled;
    case "staff":
      return enrolled && signup.nextStep !== "team";
    case "hours":
      return enrolled && signup.nextStep !== "hours";
    case "paid":
      return enrolled && (signup.nextStep === "listing_photos" || signup.nextStep === "complete");
    case "verify":
      return false;
  }
}

export function missionStates(
  signup: GuidedSignup | null,
): Record<Exclude<MissionId, "verify">, MissionState> {
  const states = {} as Record<Exclude<MissionId, "verify">, MissionState>;
  let currentTaken = false;
  for (const mission of REQUIRED_MISSIONS) {
    const id = mission.id as Exclude<MissionId, "verify">;
    if (missionDone(signup, id)) {
      states[id] = "done";
    } else if (id === "paid" && signup?.nextStep === "owner_claim") {
      states[id] = "waiting";
    } else if (!currentTaken) {
      states[id] = "current";
      currentTaken = true;
    } else {
      states[id] = "later";
    }
  }
  return states;
}

/** The first mission still to do, or null when every required one is done (or waiting). */
export function currentMission(signup: GuidedSignup | null): Mission | null {
  const states = missionStates(signup);
  return REQUIRED_MISSIONS.find((mission) => states[mission.id as keyof typeof states] === "current") ?? null;
}

export function doneCount(signup: GuidedSignup | null): number {
  const states = missionStates(signup);
  return REQUIRED_MISSIONS.filter((mission) => states[mission.id as keyof typeof states] === "done").length;
}

/** "About 3 min left" — the minutes of every required mission not yet done. */
export function minutesLeft(signup: GuidedSignup | null): number {
  const states = missionStates(signup);
  const left = REQUIRED_MISSIONS.filter(
    (mission) => states[mission.id as keyof typeof states] !== "done",
  ).reduce((sum, mission) => sum + mission.minutes, 0);
  return Math.ceil(left);
}

export function minutesLabel(minutes: number): string {
  if (minutes < 1) return "30 sec";
  return `${minutes} min`;
}

/** Every required mission done: the shop has nothing left to set up. */
export function setupComplete(signup: GuidedSignup | null): boolean {
  return Boolean(signup && (signup.nextStep === "listing_photos" || signup.nextStep === "complete"));
}

/** Enrolled: the remaining missions are the shop's own screens, not the draft. */
export function isEnrolled(signup: GuidedSignup | null): boolean {
  return Boolean(signup?.supplierId) || Boolean(signup && AFTER_ENROLL.includes(signup.nextStep));
}

/** Whether the draft's role is manager — fixed once contact details are saved. */
export function isManagerSignup(signup: GuidedSignup | null): boolean {
  return signup?.steps.eligibility?.registrantRole === "manager";
}

/** Past the draft's own steps and ready to open the shop. */
export function readyToEnroll(signup: GuidedSignup | null): boolean {
  return Boolean(signup && !signup.supplierId && past(signup.nextStep, "prints"));
}

/** The bar and line above a mission's screen: "Step 2 of 6 · 1 min". */
export function missionProgress(id: MissionId): { label: string; now: number; max: number } {
  const index = REQUIRED_MISSIONS.findIndex((mission) => mission.id === id);
  const mission = MISSIONS.find((item) => item.id === id) ?? MISSIONS[0];
  const max = REQUIRED_MISSIONS.length;
  if (index < 0) return { label: `Optional · ${minutesLabel(mission.minutes)}`, now: max, max };
  return { label: `Step ${index + 1} of ${max} · ${minutesLabel(mission.minutes)}`, now: index + 1, max };
}

/* --------------------------------------------------------------------------
   A manager's owner claims the shop
   -------------------------------------------------------------------------- */

export type OwnerLink = { status: "ok"; token: string } | { status: "failed"; message: string };

/**
 * A 24-hour claim link tied to the owner's saved mobile. One open link at a
 * time: when one is already out, it is replaced, so the newest share is the
 * one that works.
 */
export async function ownerClaimLink(): Promise<OwnerLink> {
  try {
    const created = await api.createShopInvite("owner");
    return { status: "ok", token: created.token };
  } catch (error) {
    if (errorCode(error) === "shop_owner_invite_exists") {
      try {
        const team = await api.getShopTeam();
        const open = team.invites.find(
          (invite) => (invite.kind as string) === "owner" && invite.status === "open",
        );
        if (open) {
          const replaced = await api.replaceShopInvite(open.id);
          return { status: "ok", token: replaced.token };
        }
      } catch (inner) {
        return { status: "failed", message: humanizeApiError(inner, offlineMessage("make the owner's link")) };
      }
    }
    return { status: "failed", message: humanizeApiError(error, offlineMessage("make the owner's link")) };
  }
}

export function ownerClaimMessage(url: string): string {
  return `I set up our shop on GRIDGO. Open this to claim it as the owner (works for 24 hours): ${url}`;
}
