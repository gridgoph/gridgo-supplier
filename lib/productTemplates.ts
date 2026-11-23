import type { Href } from "expo-router";

import { getApiBase } from "@/lib/api";
import { formatPhp, parseMoney } from "@/lib/money";
import { shopDateTimeLabel } from "@/lib/productionDays";
import { resolveCategoryCode, type ServiceCatalog } from "@/lib/taxonomy";

/**
 * GRIDGO product templates (gridgo-supplier#268, gridgo-api
 * `docs/PRODUCT_TEMPLATES_API.md`). The only reader of their shapes.
 *
 * A template is GRIDGO's own product — name, photo, description, the full list
 * of option combinations, the unit it is priced in — and a shop adds it by
 * pricing the combinations it makes in full. Nothing here holds a template,
 * a price or a ready time of its own: every one of them comes from GRIDGO, and
 * a GRIDGO without these routes answers 404, which is how the screens know to
 * keep today's builder instead.
 *
 * Plain words, on every screen that uses this: a listing is a **product**, on
 * or off the board is **Live** or **Hidden**, a sample is a **photo**, and
 * Operations is **the GRIDGO team**.
 */

export type TemplateUnit = "page" | "sheet" | "sq_ft" | "piece";

export type TemplateOption = { key: string; label: string };

export type ProductTemplate = {
  id: string;
  name: string;
  description: string;
  categoryCode: string;
  subcategoryCode: string;
  group: string;
  unit: TemplateUnit;
  options: TemplateOption[];
  /** The option lists the combinations are built from ("Paper size: A4, A3"). */
  optionLists: { name: string; options: string[] }[];
  photoUrl: string | null;
  photoAlt: string;
  clientTips: string[];
  express: boolean;
  machinesNeeded: string[];
  /** This shop's products made from it, hidden ones included. */
  addedItemIds: string[];
  /** Advisory usual range, for the review hint only — never a cap. */
  priceRange: { minMinor: number; maxMinor: number } | null;
};

export type ReadyTimeChip = { code: string; label: string };

/** `checkYourProducts` from `GET /me/product-templates`. */
export type CheckYourProducts = {
  /** Products hidden until the shop gives them a price. */
  unpricedItemIds: string[];
  /** How many tidy-ups the GRIDGO team would make (matches, merges). */
  suggestedCount: number;
};

export type TemplateCatalogue = {
  templates: ProductTemplate[];
  readyTimes: ReadyTimeChip[];
  check: CheckYourProducts;
};

/** What a saved product remembers of its template (`item.template`). */
export type TemplateFacts = {
  templateId: string | null;
  managed: boolean;
  /** False while GRIDGO-prepared prices wait for the shop to confirm them. */
  shopConfirmed: boolean;
  needsPrice: boolean;
  readyTime: string | null;
  unit: TemplateUnit | null;
  clientTips: string[];
  mergedInto: string | null;
  /** Prices outside the usual range, for the price check. */
  flaggedOptionKeys: string[];
};

export type PriceRow = { optionKey: string; priceMinor: number };

export type SetupRequest = {
  id: string;
  kind: "template" | "setup";
  requestedName: string | null;
  message: string | null;
  fileCount: number;
  status: string;
  reason: string | null;
  createdAt: Date | null;
};

/* --------------------------------------------------------------------------
   Reading
   -------------------------------------------------------------------------- */

type Raw = Record<string, unknown>;

function record(value: unknown): Raw | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "") : [];
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/**
 * A stock photo's address. GRIDGO names it by path
 * (`/product-template-photos/…jpg`, which redirects to a signed read) or by a
 * signed `downloadUrl`; a path is joined to this app's API base.
 */
export function templatePhotoUrl(url: string | null | undefined): string | null {
  const value = typeof url === "string" ? url.trim() : "";
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (!value.startsWith("/")) return null;
  return `${getApiBase()}${value}`;
}

/** The stock photo on a catalogue item: a photo with no file id, else the template's own. */
export function readStockPhotoUrl(raw: Record<string, unknown>): string | null {
  const photos = Array.isArray(raw.photos) ? raw.photos.map(record) : [];
  const stock = photos.find((p) => p && !text(p.fileId) && (text(p.downloadUrl) || text(p.url)));
  if (stock) return templatePhotoUrl(text(stock.downloadUrl) || text(stock.url));
  const template = record(raw.template);
  const first = (Array.isArray(template?.stockPhotos) ? template.stockPhotos : []).map(record).find(Boolean);
  return first ? templatePhotoUrl(text(first.downloadUrl) || text(first.url)) : null;
}

const UNITS: readonly TemplateUnit[] = ["page", "sheet", "sq_ft", "piece"];

export function normalizeTemplate(value: unknown): ProductTemplate | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id);
  const name = text(raw.name);
  if (!id || !name) return null;
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map(record)
    .filter((o): o is Raw => o != null)
    .map((o) => ({ key: text(o.key), label: text(o.label) }))
    .filter((o) => o.key && o.label);
  if (!options.length) return null;
  const photo = (Array.isArray(raw.stockPhotos) ? raw.stockPhotos : []).map(record).find(Boolean) ?? null;
  const range = record(raw.priceRange);
  const minMinor = positiveInt(range?.minMinor);
  const maxMinor = positiveInt(range?.maxMinor);
  return {
    id,
    name,
    description: text(raw.description),
    categoryCode: text(raw.categoryCode),
    subcategoryCode: text(raw.subcategoryCode),
    group: text(raw.group),
    unit: UNITS.includes(raw.unit as TemplateUnit) ? (raw.unit as TemplateUnit) : "piece",
    options,
    optionLists: (Array.isArray(raw.optionLists) ? raw.optionLists : [])
      .map(record)
      .filter((l): l is Raw => l != null)
      .map((l) => ({ name: text(l.name), options: strings(l.options) }))
      .filter((l) => l.name && l.options.length),
    photoUrl: photo ? templatePhotoUrl(text(photo.downloadUrl) || text(photo.url)) : null,
    photoAlt: (photo && text(photo.altText)) || name,
    clientTips: strings(raw.clientTips),
    express: raw.express === true,
    machinesNeeded: strings(raw.machinesNeeded),
    addedItemIds: strings(raw.addedItemIds),
    priceRange: minMinor && maxMinor ? { minMinor, maxMinor } : null,
  };
}

export function normalizeCatalogue(body: unknown): TemplateCatalogue {
  const raw = record(body) ?? {};
  const check = record(raw.checkYourProducts);
  return {
    templates: (Array.isArray(raw.templates) ? raw.templates : [])
      .map(normalizeTemplate)
      .filter((t): t is ProductTemplate => t != null),
    readyTimes: (Array.isArray(raw.readyTimes) ? raw.readyTimes : [])
      .map(record)
      .filter((c): c is Raw => c != null)
      .map((c) => ({ code: text(c.code), label: text(c.label) }))
      .filter((c) => c.code && c.label),
    check: {
      unpricedItemIds: strings(check?.unpricedItemIds),
      suggestedCount: Array.isArray(check?.actions) ? check.actions.length : 0,
    },
  };
}

/** `item.template` from a catalogue item, or null for a custom product. */
export function readTemplateFacts(value: unknown): TemplateFacts | null {
  const raw = record(value);
  if (!raw) return null;
  const check = record(raw.priceCheck);
  return {
    templateId: text(raw.templateId) || null,
    managed: raw.managed === true,
    shopConfirmed: raw.shopConfirmed !== false,
    needsPrice: raw.needsPrice === true,
    readyTime: text(raw.readyTime) || null,
    unit: UNITS.includes(raw.unit as TemplateUnit) ? (raw.unit as TemplateUnit) : null,
    clientTips: strings(raw.clientTips),
    mergedInto: text(raw.mergedInto) || null,
    flaggedOptionKeys: (Array.isArray(check?.flags) ? check.flags : [])
      .map(record)
      .map((f) => text(f?.optionKey))
      .filter(Boolean),
  };
}

export function normalizePriceRows(value: unknown): PriceRow[] {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .filter((r): r is Raw => r != null)
    .map((r) => ({ optionKey: text(r.optionKey), priceMinor: positiveInt(r.priceMinor) ?? 0 }))
    .filter((r) => r.optionKey);
}

export function normalizeSetupRequest(value: unknown): SetupRequest | null {
  const raw = record(value);
  if (!raw) return null;
  const id = text(raw.id);
  if (!id) return null;
  const created = typeof raw.createdAt === "string" ? new Date(raw.createdAt) : null;
  return {
    id,
    kind: raw.kind === "template" ? "template" : "setup",
    requestedName: text(raw.requestedName) || null,
    message: text(raw.message) || null,
    fileCount: Array.isArray(raw.fileIds) ? raw.fileIds.length : 0,
    status: text(raw.status) || "pending",
    reason: text(raw.reason) || null,
    createdAt: created && !Number.isNaN(created.getTime()) ? created : null,
  };
}

export function normalizeSetupRequests(body: unknown): SetupRequest[] {
  const raw = record(body);
  return (Array.isArray(raw?.requests) ? raw.requests : [])
    .map(normalizeSetupRequest)
    .filter((r): r is SetupRequest => r != null)
    .reverse();
}

/* --------------------------------------------------------------------------
   Words
   -------------------------------------------------------------------------- */

/** "per page", "per sq ft". */
export function unitLabel(unit: TemplateUnit | null): string {
  switch (unit) {
    case "page":
      return "per page";
    case "sheet":
      return "per sheet";
    case "sq_ft":
      return "per sq ft";
    default:
      return "per piece";
  }
}

/**
 * The group chip's name. GRIDGO sends codes; an unknown one still reads as
 * words rather than as a code.
 */
const GROUP_NAMES: Record<string, string> = {
  documents: "Documents",
  books_binding: "Books & binding",
  marketing: "Marketing",
  large_format: "Large format",
  stickers_labels: "Stickers & labels",
  wearables: "Wearables",
  gifts: "Gifts",
  recognition: "Awards",
};

export function groupLabel(code: string): string {
  if (GROUP_NAMES[code]) return GROUP_NAMES[code];
  const words = code.replace(/_/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : "Other";
}

/** Group codes in the order GRIDGO's list first uses them. */
export function groupsOf(templates: ProductTemplate[]): string[] {
  return [...new Set(templates.map((t) => t.group).filter(Boolean))];
}

const MACHINE_NAMES: Record<string, string> = {
  document_printer: "a document printer",
  large_format_printer: "a large-format printer",
  specialist_equipment: "specialist equipment",
};

/** "Needs a large-format printer", or null when GRIDGO names nothing. */
export function machinesLine(template: ProductTemplate): string | null {
  const names = template.machinesNeeded.map((m) => MACHINE_NAMES[m] ?? m.replace(/_/g, " "));
  return names.length ? `Needs ${names.join(" and ")}` : null;
}

/* --------------------------------------------------------------------------
   Which service line a template sits under
   -------------------------------------------------------------------------- */

type ServiceLineLike = { id: string; categoryCode: string };

/**
 * The shop's own service line for the template's category, or null.
 *
 * A template never creates a service line: a shop that does not offer the
 * category yet adds the service first. A line stored under a retired code
 * still counts, through `resolveCategoryCode`.
 */
export function serviceFor<S extends ServiceLineLike>(
  template: ProductTemplate,
  services: S[],
  catalog: ServiceCatalog | null,
): S | null {
  return (
    services.find((s) => {
      const code = catalog ? resolveCategoryCode(catalog, s.categoryCode) : s.categoryCode;
      return code === template.categoryCode;
    }) ?? null
  );
}

/* --------------------------------------------------------------------------
   The price table
   -------------------------------------------------------------------------- */

/** One row as the shop is filling it in: ticked, and the pesos as typed. */
export type DraftRow = { optionKey: string; on: boolean; price: string };

export const PRICE_REQUIRED = "Enter a price above ₱0, or untick it.";
export const PRICE_NONE_TICKED = "Tick at least one option you make.";

/**
 * What is wrong with each ticked row, keyed by option.
 *
 * The ₱0 block: a ticked row with no price, a zero price, or anything
 * `parseMoney` refuses cannot be saved. GRIDGO refuses it too
 * (`template_price_required`), so this only says it sooner and on the row.
 */
export function priceErrors(rows: DraftRow[]): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const row of rows) {
    if (!row.on) continue;
    const parsed = parseMoney(row.price);
    if (!parsed.ok || parsed.minor == null || parsed.minor <= 0) errors[row.optionKey] = PRICE_REQUIRED;
  }
  return errors;
}

/** The first sentence that stops the table being saved, or null. */
export function priceBlocker(rows: DraftRow[]): string | null {
  if (!rows.some((r) => r.on)) return PRICE_NONE_TICKED;
  const errors = priceErrors(rows);
  const count = Object.keys(errors).length;
  if (!count) return null;
  return count === 1 ? "One ticked option needs a price above ₱0." : `${count} ticked options need a price above ₱0.`;
}

/** The `prices` body: every ticked row at its full price. Call after `priceBlocker`. */
export function pricesBody(rows: DraftRow[]): PriceRow[] {
  return rows
    .filter((r) => r.on)
    .map((r) => {
      const parsed = parseMoney(r.price);
      return { optionKey: r.optionKey, priceMinor: parsed.ok && parsed.minor != null ? parsed.minor : 0 };
    });
}

/** Rows for a template, filled from a saved table when there is one. */
export function draftRows(template: ProductTemplate, saved: PriceRow[] = []): DraftRow[] {
  const byKey = new Map(saved.map((r) => [r.optionKey, r.priceMinor]));
  // A fresh table with a single option is ticked for the shop: there is nothing to choose.
  const only = template.options.length === 1 && saved.length === 0;
  return template.options.map((o) => {
    const minor = byKey.get(o.key);
    return {
      optionKey: o.key,
      on: minor != null || only,
      price: minor != null ? minorToInput(minor) : "",
    };
  });
}

/** 1250 → "12.50", 1200 → "12". */
export function minorToInput(minor: number): string {
  const whole = Math.floor(minor / 100);
  const cents = minor % 100;
  return cents ? `${whole}.${String(cents).padStart(2, "0")}` : String(whole);
}

/** "From ₱12.00 per page", for the client-sees bar. Null while nothing is priced. */
export function fromPriceLine(rows: DraftRow[], unit: TemplateUnit | null): string | null {
  const prices = pricesBody(rows.filter((r) => r.on)).map((r) => r.priceMinor).filter((m) => m > 0);
  if (!prices.length) return null;
  const low = Math.min(...prices);
  return `${prices.length > 1 ? "From " : ""}${formatPhp(low)} ${unitLabel(unit)}`;
}

/** Ticked option labels, in the template's order. */
export function tickedLabels(template: ProductTemplate, rows: DraftRow[]): string[] {
  const on = new Set(rows.filter((r) => r.on).map((r) => r.optionKey));
  return template.options.filter((o) => on.has(o.key)).map((o) => o.label);
}

/** Is a ticked price outside GRIDGO's usual range? A hint for the review, never a block. */
export function outsideUsualRange(template: ProductTemplate, row: DraftRow): boolean {
  if (!row.on || !template.priceRange) return false;
  const parsed = parseMoney(row.price);
  if (!parsed.ok || parsed.minor == null || parsed.minor <= 0) return false;
  return parsed.minor < template.priceRange.minMinor || parsed.minor > template.priceRange.maxMinor;
}

/* --------------------------------------------------------------------------
   More options
   -------------------------------------------------------------------------- */

export type MoreOptionsDraft = {
  minimumOrder: string;
  bulkFrom: string;
  bulkPrice: string;
  rushHours: string;
  rushFee: string;
  tips: string;
};

export const EMPTY_MORE: MoreOptionsDraft = {
  minimumOrder: "",
  bulkFrom: "",
  bulkPrice: "",
  rushHours: "",
  rushFee: "",
  tips: "",
};

function wholeNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** What is half-filled in More options, said as the fix. Null when it can be saved. */
export function moreOptionsBlocker(more: MoreOptionsDraft): string | null {
  if (more.minimumOrder.trim() && wholeNumber(more.minimumOrder) == null)
    return "Minimum order must be a whole number, 1 or more.";
  const bulkAny = more.bulkFrom.trim() || more.bulkPrice.trim();
  if (bulkAny) {
    if (wholeNumber(more.bulkFrom) == null || (wholeNumber(more.bulkFrom) ?? 0) < 2)
      return "Bulk discount: enter how many pieces it starts at (2 or more).";
    const price = parseMoney(more.bulkPrice);
    if (!price.ok || price.minor == null || price.minor <= 0) return "Bulk discount: enter the price each, above ₱0.";
  }
  const rushAny = more.rushHours.trim() || more.rushFee.trim();
  if (rushAny) {
    const hours = wholeNumber(more.rushHours);
    if (hours == null || hours > 24) return "Rush: enter how many hours it takes, 1 to 24.";
    const fee = parseMoney(more.rushFee);
    if (!fee.ok || fee.minor == null || fee.minor <= 0) return "Rush: enter the extra fee, above ₱0.";
  }
  if (more.tips.length > 2000) return "Tips for the client: keep it under 2,000 characters.";
  return null;
}

/** The More options part of a save body. Omitted bulk and rush clear them, as GRIDGO documents. */
export function moreOptionsBody(more: MoreOptionsDraft): Record<string, unknown> {
  const body: Record<string, unknown> = {
    minimumOrderQuantity: wholeNumber(more.minimumOrder),
    priceTiers: [],
    speedTiers: [],
  };
  const bulkFrom = wholeNumber(more.bulkFrom);
  const bulkPrice = parseMoney(more.bulkPrice);
  if (bulkFrom && bulkPrice.ok && bulkPrice.minor) {
    body.priceTiers = [{ minQuantity: bulkFrom, unitPriceMinor: bulkPrice.minor }];
  }
  const hours = wholeNumber(more.rushHours);
  const fee = parseMoney(more.rushFee);
  if (hours && fee.ok && fee.minor) {
    body.speedTiers = [{ label: "Rush", turnaroundMinutes: hours * 60, priceMinor: null, surchargeMinor: fee.minor }];
  }
  if (more.tips.trim()) body.clientTips = more.tips.trim();
  return body;
}

/** How many More options are set, for the folded header ("2 set"). */
export function moreOptionsCount(more: MoreOptionsDraft): number {
  return [
    more.minimumOrder.trim(),
    more.bulkFrom.trim() || more.bulkPrice.trim(),
    more.rushHours.trim() || more.rushFee.trim(),
    more.tips.trim(),
  ].filter(Boolean).length;
}

/** More options as a saved product holds them. */
export function moreOptionsFrom(input: {
  minimumOrderQuantity: number | null;
  priceTiers: { minQuantity: number; unitPriceMinor: number }[];
  speedTiers: { turnaround: { unit: "hours"; minutes: number } | { unit: "days"; days: number }; surchargeMinor: number | null }[];
  clientTips: string[];
  templateTips: string[];
}): MoreOptionsDraft {
  const bulk = input.priceTiers[0];
  const rush = input.speedTiers.find((t) => t.turnaround.unit === "hours" && t.surchargeMinor != null);
  const tips = input.clientTips.join("\n");
  return {
    minimumOrder: input.minimumOrderQuantity ? String(input.minimumOrderQuantity) : "",
    bulkFrom: bulk ? String(bulk.minQuantity) : "",
    bulkPrice: bulk ? minorToInput(bulk.unitPriceMinor) : "",
    rushHours: rush && rush.turnaround.unit === "hours" ? String(Math.round(rush.turnaround.minutes / 60)) : "",
    rushFee: rush?.surchargeMinor ? minorToInput(rush.surchargeMinor) : "",
    // GRIDGO's own tips are the default; only the shop's own words are kept here.
    tips: tips && tips !== input.templateTips.join("\n") ? tips : "",
  };
}

/* --------------------------------------------------------------------------
   Requests
   -------------------------------------------------------------------------- */

export function setupRequestStatus(request: SetupRequest): string {
  switch (request.status) {
    case "completed":
      return request.kind === "template" ? "Added — find it in the list" : "Done — check your products";
    case "needs_revision":
      return "The GRIDGO team needs more from you";
    default:
      return request.kind === "template" ? "With the GRIDGO team, about one working day" : "With the GRIDGO team";
  }
}

/** Setup files GRIDGO takes (`purpose=product_setup`). */
export const SETUP_FILE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "audio/mp4",
  "audio/x-m4a",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/*",
];
export const SETUP_FILES_MAX = 10;
export const SETUP_FILE_MAX_BYTES = 20 * 1024 * 1024;

/* --------------------------------------------------------------------------
   Ready time
   -------------------------------------------------------------------------- */

/**
 * The one dated example under the chips: GRIDGO's own earliest ready-by for an
 * order placed now, on the shop's hours and queue. Never worked out from the
 * chip on the phone — "next day" on a Saturday is not Sunday.
 */
export function readyByLine(preview: { earliestReadyBy: Date | null } | null): string | null {
  if (!preview?.earliestReadyBy) return null;
  return `Ordered now, ready by ${shopDateTimeLabel(preview.earliestReadyBy)}`;
}

/** The chip's own words, for the client-sees bar. */
export function readyChipLabel(chips: ReadyTimeChip[], code: string | null): string | null {
  const chip = chips.find((c) => c.code === code);
  return chip ? `Ready: ${chip.label.toLowerCase()}` : null;
}

/* --------------------------------------------------------------------------
   Standing of a saved template product
   -------------------------------------------------------------------------- */

export type TemplateStanding = {
  label: string;
  tone: "success" | "warning" | "error" | "neutral" | "info";
  icon: "circle-check" | "triangle-alert" | "clock" | "circle-x" | "circle-pause" | "square-pen";
  /** One sentence under the chip, or null. */
  detail: string | null;
  /** Whether the Live / Hidden switch may move. */
  switchable: boolean;
};

type StandingInput = {
  onTheBoard: boolean;
  suspendReason?: string | null;
  suspendedAt?: string | null;
  reviewStatus?: string | null;
  reviewReason?: string | null;
  hasApprovedVersion?: boolean;
  template?: TemplateFacts | null;
};

/**
 * Where a template product stands, in the plain words of #268: Live or Hidden,
 * and what the shop is waiting on or owes before that.
 */
export function templateStanding(item: StandingInput): TemplateStanding {
  const t = item.template;
  if (t?.mergedInto)
    return { label: "Merged", tone: "neutral", icon: "circle-pause", detail: "This product was merged into another one.", switchable: false };
  if (item.suspendReason || item.suspendedAt)
    return {
      label: "Taken down by GRIDGO",
      tone: "error",
      icon: "circle-x",
      detail: "Only the GRIDGO team can put it back. Message them to ask why.",
      switchable: false,
    };
  if (t?.needsPrice)
    return { label: "Needs a price", tone: "warning", icon: "triangle-alert", detail: "Hidden until you add its prices.", switchable: false };
  if (t && !t.shopConfirmed)
    return {
      label: "Prices to confirm",
      tone: "warning",
      icon: "square-pen",
      detail: "The GRIDGO team filled these in. Nothing goes live until you confirm.",
      switchable: false,
    };
  if (item.reviewStatus === "needs_revision")
    return {
      label: "Needs changes",
      tone: "warning",
      icon: "square-pen",
      detail: item.reviewReason ? `The GRIDGO team says: ${item.reviewReason}` : "The GRIDGO team asked for a change.",
      switchable: true,
    };
  const checking = item.reviewStatus === "pending";
  if (!item.onTheBoard)
    return {
      label: "Hidden",
      tone: "neutral",
      icon: "circle-pause",
      detail: checking ? "Clients cannot see it. The GRIDGO team is still checking its prices." : "Clients cannot see it. Turn it on any time.",
      switchable: true,
    };
  if (checking && item.hasApprovedVersion === false)
    return {
      label: "Price check today",
      tone: "info",
      icon: "clock",
      detail: "The GRIDGO team checks the prices today. It goes live once they do, and we tell you.",
      switchable: true,
    };
  return {
    label: "Live",
    tone: "success",
    icon: "circle-check",
    detail: checking ? "Clients see your earlier prices until the GRIDGO team checks the new ones." : "Clients can order it.",
    switchable: true,
  };
}

/** The page for one template product. */
export function templateProductHref(itemId: string): Href {
  return `/shop/product/${encodeURIComponent(itemId)}` as Href;
}

/**
 * Where a product on the wall opens: its price table when it is a GRIDGO
 * template product (or an older one hidden until it is priced), today's full
 * builder otherwise. An older product the GRIDGO team only matched to a
 * template keeps its builder until someone reprices it.
 */
export function productHref(listing: { id: string; template?: TemplateFacts | null }): Href {
  const table = listing.template?.managed || listing.template?.needsPrice;
  return table ? templateProductHref(listing.id) : (`/shop/${encodeURIComponent(listing.id)}` as Href);
}

/** "2 need a price · 1 to confirm" for the Check your products card. */
export function checkProductsLine(items: { template?: TemplateFacts | null }[]): string {
  const price = items.filter((i) => i.template?.needsPrice).length;
  const confirm = items.filter((i) => i.template && !i.template.needsPrice && !i.template.shopConfirmed).length;
  const parts = [
    price ? `${price} ${price === 1 ? "needs" : "need"} a price` : null,
    confirm ? `${confirm} with prices from GRIDGO to confirm` : null,
  ].filter(Boolean);
  return `${parts.join(", ")}. Hidden from clients until you do.`;
}
