import type { Order, ProductionItem } from "@/lib/api";
import { MONEY_BOUNDS, formatPhp } from "@/lib/money";

/**
 * Document and construction printing priced by how much strong colour each
 * page carries (issue report 0BE07331; contract gridgo-api
 * `docs/COLOUR_PRICING_API.md`).
 *
 * GRIDGO measures each page as it will print, on the paper and layout the
 * client chose, and counts the share of the whole sheet in strong colour.
 * Black, white, greys and light colours are not counted. The shop sets a price
 * per sheet for each colour tier and paper size; a tier left blank is not
 * offered, and a page that lands in one needs a price check. GRIDGO never
 * fills in a price.
 *
 * This is the only place a tier code, a colour reading or a colour correction
 * becomes words, and the words are the web dashboard's, so a shop reads the
 * same thing on both. Every figure here is the shop's own: GRIDGO's fee and the
 * client's all-in price are withheld from this app.
 */

// ---------------------------------------------------------------------------
// Tiers
// ---------------------------------------------------------------------------

export const LARGE_FORMAT_TIERS = ["none", "up_to_25", "up_to_50", "above_50"] as const;
export const A3_TIERS = ["monochrome", "full_colour"] as const;

export type LargeFormatTier = (typeof LARGE_FORMAT_TIERS)[number];
export type A3Tier = (typeof A3_TIERS)[number];
export type ColourTier = LargeFormatTier | A3Tier;
export type TierSet = "large_format" | "a3";

export const TIERS_OF: Record<TierSet, readonly ColourTier[]> = {
  large_format: LARGE_FORMAT_TIERS,
  a3: A3_TIERS,
};

/** GRIDGO's shipped A3 monochrome limit, 10% of the sheet. Super Admin can move it. */
export const DEFAULT_A3_LIMIT_BPS = 1000;

export function isColourTier(value: unknown): value is ColourTier {
  return (
    typeof value === "string" &&
    ((LARGE_FORMAT_TIERS as readonly string[]).includes(value) ||
      (A3_TIERS as readonly string[]).includes(value))
  );
}

/** Basis points as a percent a person reads: 1800 → "18%", 1250 → "12.5%". */
export function bpsPercent(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

/** The tier as a shop says it. The A3 limit is a setting, so its labels carry the limit in force. */
export function tierLabel(tier: string, a3LimitBps: number = DEFAULT_A3_LIMIT_BPS): string {
  switch (tier) {
    case "none":
      return "No strong colour";
    case "up_to_25":
      return "Up to 25%";
    case "up_to_50":
      return "Up to 50%";
    case "above_50":
      return "Above 50%";
    case "monochrome":
      return `Up to ${bpsPercent(a3LimitBps)}, monochrome`;
    case "full_colour":
      return `Above ${bpsPercent(a3LimitBps)}, full colour`;
    default:
      return "Unknown tier";
  }
}

/** What a tier means, in the line under its label. */
export function tierHint(tier: ColourTier, a3LimitBps: number = DEFAULT_A3_LIMIT_BPS): string {
  switch (tier) {
    case "none":
      return "Black, white, greys and light colours only";
    case "up_to_25":
      return "Some strong colour, up to a quarter of the sheet";
    case "up_to_50":
      return "Up to half the sheet in strong colour";
    case "above_50":
      return "Full page coloured";
    case "monochrome":
      return `Strong colour on at most ${bpsPercent(a3LimitBps)} of the sheet`;
    case "full_colour":
      return `Strong colour on more than ${bpsPercent(a3LimitBps)} of the sheet`;
  }
}

/**
 * How full the tier's glyph is drawn, in basis points: the top of its band,
 * so the four large-format tiers read as four steps even in greyscale.
 */
export function tierGlyphBps(tier: ColourTier, a3LimitBps: number = DEFAULT_A3_LIMIT_BPS): number {
  switch (tier) {
    case "none":
      return 0;
    case "up_to_25":
      return 2500;
    case "up_to_50":
      return 5000;
    case "above_50":
    case "full_colour":
      return 10_000;
    case "monochrome":
      return a3LimitBps;
  }
}

/** GRIDGO's `colourTier`: every boundary is inclusive at the top. */
export function tierFor(bps: number, tierSet: TierSet, a3LimitBps: number = DEFAULT_A3_LIMIT_BPS): ColourTier {
  if (tierSet === "a3") return bps <= a3LimitBps ? "monochrome" : "full_colour";
  if (bps === 0) return "none";
  if (bps <= 2500) return "up_to_25";
  if (bps <= 5000) return "up_to_50";
  return "above_50";
}

// ---------------------------------------------------------------------------
// Paper sizes (mirrors gridgo-api `src/print-layout.js` `parsePaperSize`)
// ---------------------------------------------------------------------------

const PAPER_SIZES: Record<string, readonly [number, number]> = {
  a0: [841, 1189],
  a1: [594, 841],
  a2: [420, 594],
  a3: [297, 420],
  a4: [210, 297],
  a5: [148, 210],
  a6: [105, 148],
  b4: [250, 353],
  b5: [176, 250],
  short: [215.9, 279.4],
  letter: [215.9, 279.4],
  long: [215.9, 330.2],
  folio: [215.9, 330.2],
  legal: [215.9, 355.6],
  tabloid: [279.4, 431.8],
  ledger: [279.4, 431.8],
};

const UNIT_MM: Record<string, number> = {
  mm: 1,
  cm: 10,
  in: 25.4,
  inch: 25.4,
  inches: 25.4,
  '"': 25.4,
  ft: 304.8,
  feet: 304.8,
  "'": 304.8,
};

export type PaperRead = { widthMilli: number; heightMilli: number; a3: boolean };

function paperOf(widthMm: number, heightMm: number): PaperRead {
  const widthMilli = Math.round(widthMm * 1000);
  const heightMilli = Math.round(heightMm * 1000);
  const short = Math.min(widthMilli, heightMilli);
  const long = Math.max(widthMilli, heightMilli);
  // GRIDGO names a page A3 within 2 mm either way round.
  const a3 = Math.abs(short - 297_000) <= 2000 && Math.abs(long - 420_000) <= 2000;
  return { widthMilli, heightMilli, a3 };
}

/**
 * The paper a shop typed: a name (A3, Short, Legal) or width × height with an
 * optional unit. A bare "20x30" is inches, the way plotting sizes are quoted.
 */
export function readPaperSize(text: string): PaperRead | null {
  const value = text.trim().toLowerCase();
  if (!value || value.length > 120) return null;
  const named = /^([a-z]+\d?)\b/.exec(value)?.[1];
  if (named && PAPER_SIZES[named]) return paperOf(...PAPER_SIZES[named]);
  const unit = "(mm|cm|inches|inch|in|feet|ft|\"|')?";
  const match = new RegExp(
    `(\\d+(?:\\.\\d+)?)\\s*${unit}\\s*[x×]\\s*(\\d+(?:\\.\\d+)?)\\s*${unit}`,
  ).exec(value);
  if (match) {
    const scale = UNIT_MM[match[4] || match[2] || "in"];
    const width = Number(match[1]) * scale;
    const height = Number(match[3]) * scale;
    if (width > 0 && height > 0 && width <= 20_000 && height <= 20_000) return paperOf(width, height);
  }
  for (const word of value.split(/[^a-z0-9]+/)) {
    if (PAPER_SIZES[word]) return paperOf(...PAPER_SIZES[word]);
  }
  return null;
}

/** A3 takes the two A3 tiers; every other size the four large-format tiers. */
export function tierSetOf(paper: PaperRead): TierSet {
  return paper.a3 ? "a3" : "large_format";
}

function physicalKey(paper: Pick<PaperRead, "widthMilli" | "heightMilli">): string {
  return `${Math.min(paper.widthMilli, paper.heightMilli)}:${Math.max(paper.widthMilli, paper.heightMilli)}`;
}

/** "20 × 30 in" or "297 × 420 mm" from thousandths of a millimetre. */
export function paperDimensions(size: { widthMilli: number; heightMilli: number }): string {
  const w = size.widthMilli / 25_400;
  const h = size.heightMilli / 25_400;
  const whole = (n: number) => Math.abs(n - Math.round(n)) < 0.02;
  if (whole(w) && whole(h)) return `${Math.round(w)} × ${Math.round(h)} in`;
  return `${Math.round(size.widthMilli / 1000)} × ${Math.round(size.heightMilli / 1000)} mm`;
}

/** The line under a typed paper size: what GRIDGO read, and which tiers it takes. */
export function paperReading(text: string): string | null {
  const paper = readPaperSize(text);
  if (!paper) return null;
  const tiers = tierSetOf(paper) === "a3" ? "Priced in the two A3 tiers." : "Priced in the four large-format tiers.";
  return `${paperDimensions(paper)}. ${tiers}`;
}

// ---------------------------------------------------------------------------
// The shop's tier table on a listing
// ---------------------------------------------------------------------------

export type ColourPriceSize = {
  paperSize: string;
  tierSet: TierSet;
  /** Shop-set per-sheet centavos. A missing tier is not offered. */
  prices: Partial<Record<ColourTier, number>>;
};

export type ListingColourPricing = { sizes: ColourPriceSize[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The listing's table as GRIDGO sent it; null when absent or unreadable. */
export function readColourPricing(value: unknown): ListingColourPricing | null {
  if (!isRecord(value) || !Array.isArray(value.sizes)) return null;
  const sizes = value.sizes.flatMap((row): ColourPriceSize[] => {
    if (!isRecord(row) || typeof row.paperSize !== "string") return [];
    const tierSet: TierSet = row.tierSet === "a3" ? "a3" : "large_format";
    const prices: ColourPriceSize["prices"] = {};
    if (isRecord(row.prices)) {
      for (const tier of TIERS_OF[tierSet]) {
        const price = row.prices[tier];
        if (typeof price === "number" && Number.isSafeInteger(price) && price >= 0) prices[tier] = price;
      }
    }
    return [{ paperSize: row.paperSize, tierSet, prices }];
  });
  return { sizes };
}

/** The listing's lowest offered sheet rate, the shop's own figure. */
export function lowestSheetRate(pricing: ListingColourPricing | null): number | null {
  const all = (pricing?.sizes ?? []).flatMap((size) =>
    Object.values(size.prices).filter((price): price is number => typeof price === "number"),
  );
  return all.length ? Math.min(...all) : null;
}

/** Pesos as typed, per tier. Blank means the tier is not offered on that paper. */
export type ColourSizeDraft = {
  key: string;
  paperSize: string;
  prices: Partial<Record<ColourTier, string>>;
};

export type ColourDraft = ColourSizeDraft[];

export const COLOUR_SIZES_MAX = 32;

let draftKey = 0;
export function newSizeKey(): string {
  draftKey += 1;
  return `size_${draftKey}`;
}

function pesosText(minor: number): string {
  return (minor / 100).toFixed(2);
}

export function colourDraftFrom(pricing: ListingColourPricing | null): ColourDraft {
  return (pricing?.sizes ?? []).map((size, index) => ({
    key: `saved_${index}`,
    paperSize: size.paperSize,
    prices: Object.fromEntries(
      Object.entries(size.prices).map(([tier, minor]) => [tier, pesosText(minor ?? 0)]),
    ),
  }));
}

/**
 * One tier's price as typed → centavos. Unlike a listing's own price, ₱0 is
 * allowed: it is an explicit free sheet, which is not the same as blank.
 */
export function sheetPriceMinor(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const minor = Math.round(Number(trimmed) * 100);
  return minor <= MONEY_BOUNDS.maxMinor ? minor : null;
}

export type ColourDraftProblem = { key: string | null; message: string };

export type ColourPricingPayload = {
  sizes: { paperSize: string; tierSet: TierSet; prices: Partial<Record<ColourTier, number>> }[];
};

export type ColourDraftRead =
  | { ok: true; pricing: ColourPricingPayload }
  | { ok: false; problem: ColourDraftProblem };

/**
 * The table GRIDGO receives, or the first thing it would refuse. A blank
 * price is left out (not offered), never sent as zero.
 */
export function readColourDraft(draft: ColourDraft): ColourDraftRead {
  if (!draft.length) {
    return { ok: false, problem: { key: null, message: "Add at least one paper size with its colour prices." } };
  }
  if (draft.length > COLOUR_SIZES_MAX) {
    return {
      ok: false,
      problem: { key: null, message: `A listing can price at most ${COLOUR_SIZES_MAX} paper sizes.` },
    };
  }
  const seen = new Map<string, string>();
  const sizes: ColourPricingPayload["sizes"] = [];
  for (const row of draft) {
    const name = row.paperSize.trim();
    const paper = readPaperSize(name);
    if (!paper) {
      return {
        ok: false,
        problem: {
          key: row.key,
          message: name
            ? `“${name}” is not a paper size GRIDGO can read. Use a name like A3 or a size like 20x30.`
            : "Name each paper size, like A3 or 20x30.",
        },
      };
    }
    const physical = physicalKey(paper);
    const earlier = seen.get(physical);
    if (earlier) {
      return {
        ok: false,
        problem: { key: row.key, message: `${name} is the same paper as ${earlier}. Price each paper once.` },
      };
    }
    seen.set(physical, name);
    const tierSet = tierSetOf(paper);
    const prices: Partial<Record<ColourTier, number>> = {};
    for (const tier of TIERS_OF[tierSet]) {
      const typed = (row.prices[tier] ?? "").trim();
      if (!typed) continue;
      const minor = sheetPriceMinor(typed);
      if (minor == null) {
        return {
          ok: false,
          problem: {
            key: row.key,
            message: `Enter the ${name} “${tierLabel(tier)}” price in pesos, like 60.00, or leave it blank.`,
          },
        };
      }
      prices[tier] = minor;
    }
    sizes.push({ paperSize: name, tierSet, prices });
  }
  return { ok: true, pricing: { sizes } };
}

/** Whether two drafts would send the same table. */
export function sameColourDraft(left: ColourDraft, right: ColourDraft): boolean {
  const key = (draft: ColourDraft) =>
    JSON.stringify(draft.map((row) => [row.paperSize, Object.entries(row.prices).filter(([, v]) => (v ?? "").trim()).sort()]));
  return key(left) === key(right);
}

/** Sizes in the draft with every tier blank: nothing on that paper can be priced. */
export function unpricedSizes(draft: ColourDraft): string[] {
  return draft
    .filter((row) => row.paperSize.trim())
    .filter((row) => Object.values(row.prices).every((price) => !(price ?? "").trim()))
    .map((row) => row.paperSize.trim());
}

/** Paper names the listing's size options already carry, offered as one-tap rows. */
export function suggestedPapers(labels: readonly string[], draft: ColourDraft): string[] {
  const taken = new Set(
    draft.flatMap((row) => {
      const paper = readPaperSize(row.paperSize);
      return paper ? [physicalKey(paper)] : [];
    }),
  );
  const out: string[] = [];
  for (const label of labels) {
    const paper = readPaperSize(label);
    if (!paper) continue;
    const key = physicalKey(paper);
    if (taken.has(key)) continue;
    taken.add(key);
    out.push(label.trim());
  }
  return out;
}

export const COLOUR_PRICES_NEEDED = "Price at least one colour tier on one paper size before it can go on the board.";
export const COLOUR_LAYOUT_NEEDED =
  "Pricing by colour needs at least one print layout, so GRIDGO measures each page the way it sits on the paper. Nothing saves until one is marked.";

/** The two ways a per-page listing is priced, as the segmented control says them. */
export const COLOUR_MODE_CHOICES = [
  { value: "fixed", label: "Same price every page" },
  { value: "colour", label: "Priced by colour" },
] as const;

export function colourModeHint(pricedByColour: boolean): string {
  return pricedByColour
    ? "For document and construction prints charged by how much strong colour a sheet carries, like whiteprints. Fixed-price work such as CAD plotting, blueprint or photo paper keeps one price."
    : "One price for every page, whatever its colour. Choose priced by colour if you charge more for pages with strong colour.";
}

export const COLOUR_TABLE_INTRO =
  "GRIDGO measures how much of each page is strong colour, as it will print on the paper the client picks. Black, white, greys and light colours do not count. Each page is charged your price for its tier. Leave a tier blank if you do not offer it on that paper: a page that lands there goes to the GRIDGO Team for a price check, and GRIDGO never fills in a price for you.";

export const ONE_COLOUR_LABEL = "Prints in one colour";
export const ONE_COLOUR_HINT =
  "For blueprint or monochrome work. A client whose file has colour is told this service prints in one colour. It never blocks the order or changes your price.";

// ---------------------------------------------------------------------------
// The reading on a job (order line evidence and corrections)
// ---------------------------------------------------------------------------

export type QuantityMode = "copies_each_page" | "document_sets";

export type ColourPage = {
  fileId: string;
  page: number;
  strongColourBps: number;
  tier: string | null;
  /** The shop's own rate. Null when the shop had no price for the page's tier. */
  sheetPriceMinor: number | null;
};

export type ColourQuote = {
  status: string;
  pricedByColour: boolean;
  quantityMode: QuantityMode | null;
  quantity: number;
  totalSheets: number | null;
  paperSize: string | null;
  tierSet: TierSet | null;
  /** The shop's line total. */
  lineSubtotalMinor: number | null;
  /** On a correction: the line total it is measured against, and the corrected one. */
  originalLineSubtotalMinor: number | null;
  correctedLineSubtotalMinor: number | null;
  warning: string | null;
  pages: ColourPage[];
  /** The A3 limit the reading was made with. */
  a3LimitBps: number;
};

function readPage(value: unknown): ColourPage | null {
  if (!isRecord(value)) return null;
  const page = num(value.page);
  const bps = num(value.strongColourBps);
  if (page == null || bps == null) return null;
  return {
    fileId: typeof value.fileId === "string" ? value.fileId : "",
    page,
    strongColourBps: bps,
    tier: typeof value.tier === "string" ? value.tier : null,
    sheetPriceMinor: num(value.sheetPriceMinor),
  };
}

/** A line snapshot or a correction from GRIDGO; null when absent or unreadable. */
export function readColourQuote(value: unknown): ColourQuote | null {
  if (!isRecord(value) || !Array.isArray(value.pages)) return null;
  const mode = value.quantityMode;
  const request = isRecord(value.request) ? value.request : null;
  const thresholds = request && isRecord(request.thresholds) ? request.thresholds : null;
  return {
    status: typeof value.status === "string" ? value.status : "priced",
    pricedByColour: value.pricedByColour !== false,
    quantityMode: mode === "copies_each_page" || mode === "document_sets" ? mode : null,
    quantity: num(value.quantity) ?? 1,
    totalSheets: num(value.totalSheets),
    paperSize: typeof value.paperSize === "string" ? value.paperSize : null,
    tierSet: value.tierSet === "a3" ? "a3" : value.tierSet === "large_format" ? "large_format" : null,
    lineSubtotalMinor: num(value.lineSubtotalMinor),
    originalLineSubtotalMinor: num(value.originalLineSubtotalMinor),
    correctedLineSubtotalMinor: num(value.correctedLineSubtotalMinor),
    warning: typeof value.warning === "string" ? value.warning : null,
    pages: value.pages.flatMap((row) => {
      const page = readPage(row);
      return page ? [page] : [];
    }),
    a3LimitBps: num(thresholds?.a3MonochromeMaxBps) ?? DEFAULT_A3_LIMIT_BPS,
  };
}

export const PRICE_CHECK_MESSAGE = "This page needs a price check";

/** "Page 3: 18% strong colour, ₱60.00", or the price check when the page has no rate. */
export function pageLine(page: Pick<ColourPage, "page" | "strongColourBps" | "sheetPriceMinor">): string {
  const coverage = `Page ${page.page}: ${bpsPercent(page.strongColourBps)} strong colour`;
  if (page.sheetPriceMinor == null) return `${coverage}. ${PRICE_CHECK_MESSAGE}`;
  return `${coverage}, ${formatPhp(page.sheetPriceMinor)}`;
}

/** "3 sets × 12 pages = 36 sheets"; never multiplied twice. */
export function sheetsLine(mode: QuantityMode | null, quantity: number, pages: number): string {
  const sheets = quantity * pages;
  const pagesWord = `${pages} ${pages === 1 ? "page" : "pages"}`;
  const sheetsWord = `${sheets} ${sheets === 1 ? "sheet" : "sheets"}`;
  if (mode === "document_sets") return `${quantity} ${quantity === 1 ? "set" : "sets"} × ${pagesWord} = ${sheetsWord}`;
  if (mode === "copies_each_page") {
    return `${quantity} ${quantity === 1 ? "copy" : "copies"} of each page × ${pagesWord} = ${sheetsWord}`;
  }
  return `${quantity} × ${pagesWord} = ${sheetsWord}`;
}

export function quantityModeLabel(mode: QuantityMode | null): string {
  if (mode === "document_sets") return "Sets of the whole document";
  if (mode === "copies_each_page") return "Copies of each page";
  return "Not chosen";
}

/** The pages that moved between GRIDGO's reading and a correction, by `(fileId, page)`. */
export function movedPages(original: ColourQuote | null, correction: ColourQuote): ColourPage[] {
  const before = new Map((original?.pages ?? []).map((page) => [`${page.fileId}:${page.page}`, page]));
  return correction.pages.filter((page) => {
    const was = before.get(`${page.fileId}:${page.page}`);
    return !was || was.strongColourBps !== page.strongColourBps || was.sheetPriceMinor !== page.sheetPriceMinor;
  });
}

// ---------------------------------------------------------------------------
// The shop's correction of a clearly wrong estimate (a change request)
// ---------------------------------------------------------------------------

export type CorrectionDraftRow = { fileId: string; page: number; percent: string; price: string };

/**
 * What a new correction starts from and is compared with: the pages of the
 * latest correction the client agreed to, or GRIDGO's reading when there is
 * none. GRIDGO measures a second correction against the first, so starting a
 * second one from the original reading would ask for a refund of the first.
 */
export function correctionStart(
  quote: ColourQuote,
  agreed: Pick<ColourQuote, "pages"> | null | undefined,
): ColourQuote {
  if (!agreed?.pages.length) return quote;
  const latest = new Map(agreed.pages.map((page) => [`${page.fileId}:${page.page}`, page]));
  return { ...quote, pages: quote.pages.map((page) => latest.get(`${page.fileId}:${page.page}`) ?? page) };
}

export function correctionDraft(quote: ColourQuote): CorrectionDraftRow[] {
  return quote.pages.map((page) => ({
    fileId: page.fileId,
    page: page.page,
    percent: String(page.strongColourBps / 100),
    price: page.sheetPriceMinor == null ? "" : pesosText(page.sheetPriceMinor),
  }));
}

/** A percent typed with up to two decimals → whole basis points, or null. */
export function percentToBps(text: string): number | null {
  const cleaned = text.trim().replace(/%$/, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const bps = Math.round(Number(cleaned) * 100);
  return bps >= 0 && bps <= 10_000 ? bps : null;
}

export type CorrectionRead =
  | {
      ok: true;
      pages: { fileId: string; page: number; strongColourBps: number; sheetPriceMinor: number }[];
      correctedLineSubtotalMinor: number;
      extraMinor: number;
      changed: boolean;
    }
  | { ok: false; page: number | null; problem: string };

/**
 * The corrected pages GRIDGO receives, with the line total and the extra
 * worked out the way GRIDGO does: corrected rates × the original quantity,
 * against the latest agreed correction or the original line. GRIDGO derives it
 * again and refuses a mismatch; this only shows the shop what it is asking.
 */
export function readCorrection(quote: ColourQuote, rows: CorrectionDraftRow[], baselineMinor: number): CorrectionRead {
  const pages = [];
  for (const row of rows) {
    const bps = percentToBps(row.percent);
    if (bps == null) {
      return { ok: false, page: row.page, problem: `Page ${row.page}: enter the strong colour as a percent from 0 to 100.` };
    }
    const price = sheetPriceMinor(row.price);
    if (price == null) {
      return { ok: false, page: row.page, problem: `Page ${row.page}: enter your sheet price in pesos, like 60.00.` };
    }
    pages.push({ fileId: row.fileId, page: row.page, strongColourBps: bps, sheetPriceMinor: price });
  }
  const correctedLineSubtotalMinor =
    pages.reduce((sum, page) => sum + page.sheetPriceMinor, 0) * Math.max(1, quote.quantity);
  const original = new Map(quote.pages.map((page) => [`${page.fileId}:${page.page}`, page]));
  const changed = pages.some((page) => {
    const before = original.get(`${page.fileId}:${page.page}`);
    return !before || before.strongColourBps !== page.strongColourBps || before.sheetPriceMinor !== page.sheetPriceMinor;
  });
  return { ok: true, pages, correctedLineSubtotalMinor, extraMinor: correctedLineSubtotalMinor - baselineMinor, changed };
}

/** The shop's line total a new correction is measured against. */
export function correctionBaseline(
  quote: ColourQuote,
  applied: Pick<ColourQuote, "correctedLineSubtotalMinor"> | null | undefined,
): number | null {
  return applied?.correctedLineSubtotalMinor ?? quote.lineSubtotalMinor ?? null;
}

/** What stops a correction being sent, before it reaches GRIDGO. */
export function correctionProblem(read: CorrectionRead, baseline: number | null): string | null {
  if (!read.ok) return read.problem;
  if (baseline == null) return "This job has no complete colour price to correct. Contact the GRIDGO Team.";
  if (!read.changed) return "Change the reading or price of at least one page.";
  if (read.extraMinor < 0) return COLOUR_CORRECTION_REFUND;
  return null;
}

export const COLOUR_CORRECTION_REFUND =
  "These prices come to less than the client paid. A lower price is a refund: contact the GRIDGO Team, who refund the client through Operations.";

// ---------------------------------------------------------------------------
// Colour lines on a job
// ---------------------------------------------------------------------------

export type ColourLine = {
  item: ProductionItem;
  quote: ColourQuote;
  /** The latest correction the client agreed to, shown under the original, never in its place. */
  agreed: (ColourQuote & { appliedAt: string | null }) | null;
};

/** Lines carrying a colour reading: priced by colour, or a one-colour service. */
export function colourLines(order: Pick<Order, "productionItems">): ColourLine[] {
  return (order.productionItems ?? []).flatMap((item): ColourLine[] => {
    const quote = readColourQuote(item.colourPricing);
    if (!quote || !quote.pages.length) return [];
    const agreedRaw = item.agreedColourCorrection;
    const agreed = readColourQuote(agreedRaw);
    const appliedAt = isRecord(agreedRaw) && typeof agreedRaw.appliedAt === "string" ? agreedRaw.appliedAt : null;
    return [{ item, quote, agreed: agreed ? { ...agreed, appliedAt } : null }];
  });
}

/** Lines a shop may correct: priced by colour, with pages GRIDGO measured. */
export function correctableColourLines(order: Pick<Order, "productionItems">): ColourLine[] {
  return colourLines(order).filter((line) => line.quote.pricedByColour);
}
