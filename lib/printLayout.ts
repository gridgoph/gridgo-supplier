/**
 * Print layout: how a document or drawing is placed on the paper
 * (gridgo-api `docs/PRINT_LAYOUT_API.md`).
 *
 * A shop marks which layouts a listing prints; a client ordering that listing
 * must choose one, and GRIDGO snapshots the choice and its fit check onto the
 * order as part of the agreed spec. This module is the only place a layout
 * code, or a fact of the fit check, becomes words.
 *
 * Two rules it holds. The check is GRIDGO's, measured when the client ordered,
 * so nothing here re-measures or second-guesses it: a size GRIDGO could not
 * read is said to be unread, never guessed. And the check never blocks an
 * order — a page that will be cut off is what the client chose after being
 * told, so the shop is told to print it as agreed, not to fix it.
 */

export type PrintLayoutCode = "fit_to_paper" | "actual_size_centered" | "actual_size_original_position";

/** Canonical order, which is also the order GRIDGO lists them in. */
export const PRINT_LAYOUT_CODES: readonly PrintLayoutCode[] = [
  "fit_to_paper",
  "actual_size_centered",
  "actual_size_original_position",
];

export const PRINT_LAYOUT_LABEL: Record<PrintLayoutCode, string> = {
  fit_to_paper: "Fit to paper",
  actual_size_centered: "Actual size, centred",
  actual_size_original_position: "Actual size, in its original position",
};

/** What printing it this way means, said to the shop that prints it. */
export const PRINT_LAYOUT_MEANING: Record<PrintLayoutCode, string> = {
  fit_to_paper:
    "Scaled up or down to fill the paper. The drawing scale changes unless the page is already that size.",
  actual_size_centered: "Printed at 100%, centred on the paper. A bigger page loses its edges.",
  actual_size_original_position:
    "Printed at 100% from the page's top-left corner. A bigger page loses its right and bottom edges.",
};

export function isPrintLayoutCode(value: unknown): value is PrintLayoutCode {
  return typeof value === "string" && (PRINT_LAYOUT_CODES as readonly string[]).includes(value);
}

/** A listing's layouts: known codes only, deduplicated, in canonical order. */
export function readPrintLayouts(value: unknown): PrintLayoutCode[] {
  if (!Array.isArray(value)) return [];
  return PRINT_LAYOUT_CODES.filter((code) => value.includes(code));
}

export function togglePrintLayout(
  layouts: readonly PrintLayoutCode[],
  code: PrintLayoutCode,
): PrintLayoutCode[] {
  const next = layouts.includes(code) ? layouts.filter((item) => item !== code) : [...layouts, code];
  return readPrintLayouts(next);
}

export function samePrintLayouts(
  left: readonly PrintLayoutCode[],
  right: readonly PrintLayoutCode[],
): boolean {
  return readPrintLayouts(left).join(",") === readPrintLayouts(right).join(",");
}

/* --------------------------------------------------------------------------
   Listing editor copy
   -------------------------------------------------------------------------- */

export const PRINT_LAYOUTS_HINT =
  "For documents and construction prints. Mark each way you can place a client's file on the paper.";

/**
 * What marking layouts does to a client, and whether this change waits on
 * review. GRIDGO's shop read carries only the listing's current set, not the
 * approved one beside it, so a pending change says clients keep the approved
 * layouts rather than naming them.
 */
export function printLayoutsNote(input: {
  layouts: readonly PrintLayoutCode[];
  /** The working set differs from what GRIDGO holds. */
  changed: boolean;
  /** The listing has a version clients already see (it is not waiting for its first approval). */
  hasApprovedVersion: boolean;
  /** GRIDGO holds a change to this listing that the GRIDGO Team has not approved yet. */
  pendingReview: boolean;
}): string[] {
  const lines = [
    input.layouts.length
      ? input.layouts.length === 1
        ? "Clients must choose this layout before they can order this listing."
        : "Clients must choose one of these layouts before they can order this listing."
      : "With none marked, clients are not asked about layout.",
  ];
  if (input.changed && input.hasApprovedVersion) {
    lines.push(
      "Saving sends this change to the GRIDGO Team for review. Until it is approved, clients keep the layouts they see now.",
    );
  } else if (!input.changed && input.pendingReview && input.hasApprovedVersion) {
    lines.push(
      "Your latest changes to this listing are with the GRIDGO Team. Until they are approved, clients see the layouts from your approved version.",
    );
  } else if (input.changed) {
    lines.push("The GRIDGO Team reviews layouts with the rest of this listing.");
  }
  return lines;
}

/* --------------------------------------------------------------------------
   The fit check on a job
   -------------------------------------------------------------------------- */

export type LayoutPaper = {
  label: string;
  widthMilli: number | null;
  heightMilli: number | null;
  pageSize: string | null;
};

export type LayoutPage = {
  widthMilli: number;
  heightMilli: number;
  pageSize: string | null;
  largestShortSideMilli: number;
  largestLongSideMilli: number;
  mixedPageSizes: boolean;
};

export type PrintLayoutCheck = {
  layout: PrintLayoutCode | null;
  paper: LayoutPaper | null;
  files: { fileId: string; page: LayoutPage | null; exceedsPaper: boolean | null }[];
  exceedsPaper: boolean | null;
  cutOff: boolean | null;
  scaleChanges: boolean | null;
  suggestedPaper: LayoutPaper | null;
  unknown: { code: string; fileId?: string }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

function flag(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readPaper(value: unknown): LayoutPaper | null {
  if (!isRecord(value)) return null;
  const pageSize = text(value.pageSize);
  const label = text(value.label) ?? pageSize;
  if (!label) return null;
  return {
    label,
    widthMilli: positive(value.widthMilli),
    heightMilli: positive(value.heightMilli),
    pageSize,
  };
}

function readPage(value: unknown): LayoutPage | null {
  if (!isRecord(value)) return null;
  const widthMilli = positive(value.widthMilli);
  const heightMilli = positive(value.heightMilli);
  if (!widthMilli || !heightMilli) return null;
  return {
    widthMilli,
    heightMilli,
    pageSize: text(value.pageSize),
    largestShortSideMilli: positive(value.largestShortSideMilli) ?? Math.min(widthMilli, heightMilli),
    largestLongSideMilli: positive(value.largestLongSideMilli) ?? Math.max(widthMilli, heightMilli),
    mixedPageSizes: value.mixedPageSizes === true,
  };
}

/** The snapshotted check on an order line. Null for a product with no layouts. */
export function readPrintLayoutCheck(value: unknown): PrintLayoutCheck | null {
  if (!isRecord(value)) return null;
  return {
    layout: isPrintLayoutCode(value.layout) ? value.layout : null,
    paper: readPaper(value.paper),
    files: (Array.isArray(value.files) ? value.files : []).filter(isRecord).map((file) => ({
      fileId: text(file.fileId) ?? "",
      page: readPage(file.page),
      exceedsPaper: flag(file.exceedsPaper),
    })),
    exceedsPaper: flag(value.exceedsPaper),
    cutOff: flag(value.cutOff),
    scaleChanges: flag(value.scaleChanges),
    suggestedPaper: readPaper(value.suggestedPaper),
    unknown: (Array.isArray(value.unknown) ? value.unknown : [])
      .filter(isRecord)
      .map((entry) => ({ code: text(entry.code) ?? "", ...(text(entry.fileId) ? { fileId: text(entry.fileId) ?? "" } : {}) }))
      .filter((entry) => entry.code),
  };
}

/** "594 × 841 mm". Whole millimetres: nobody trims to a thousandth. */
export function formatMilliSize(widthMilli: number, heightMilli: number): string {
  return `${Math.round(widthMilli / 1000)} × ${Math.round(heightMilli / 1000)} mm`;
}

/** The client's page, as a shop would say it. */
export function pageSizeText(page: LayoutPage): string {
  if (page.mixedPageSizes) {
    return `Mixed sizes, largest ${formatMilliSize(page.largestShortSideMilli, page.largestLongSideMilli)}`;
  }
  const measured = formatMilliSize(page.widthMilli, page.heightMilli);
  return page.pageSize ? `${page.pageSize} (${measured})` : measured;
}

export type LayoutFactTone = "cut_off" | "scaled" | "fits" | "unread";

export type PrintLayoutFacts = {
  layout: PrintLayoutCode;
  /** Spec rows: the layout, the paper, the client's page. */
  rows: { label: string; value: string; muted?: boolean }[];
  /** What it means at the press, one sentence each, most important first. */
  notes: { tone: LayoutFactTone; text: string }[];
};

/**
 * The agreed layout and what the shop needs from GRIDGO's check to print it.
 *
 * Null for a line with no layout (a product that offers none, or an order
 * older than layouts), which then shows nothing.
 */
export function printLayoutFacts(item: { printLayout?: unknown; printLayoutCheck?: unknown }): PrintLayoutFacts | null {
  const check = readPrintLayoutCheck(item.printLayoutCheck);
  const layout = isPrintLayoutCode(item.printLayout) ? item.printLayout : check?.layout ?? null;
  if (!layout) return null;

  const rows: PrintLayoutFacts["rows"] = [{ label: "Print layout", value: PRINT_LAYOUT_LABEL[layout] }];
  const notes: PrintLayoutFacts["notes"] = [];
  if (!check) return { layout, rows, notes };

  const paper = check.paper;
  rows.push(paper ? { label: "Paper", value: paper.label } : { label: "Paper", value: "Not read", muted: true });
  const pages = check.files.map((file) => file.page);
  if (pages.length === 1) {
    rows.push(pages[0] ? { label: "Their page", value: pageSizeText(pages[0]) } : { label: "Their page", value: "Not read", muted: true });
  } else {
    pages.forEach((page, index) => {
      const label = `File ${index + 1} page`;
      rows.push(page ? { label, value: pageSizeText(page) } : { label, value: "Not read", muted: true });
    });
  }

  const paperName = paper?.label ?? "the paper";
  if (check.cutOff === true) {
    notes.push({
      tone: "cut_off",
      text: `Their page is bigger than ${paperName}, so at actual size its ${layout === "actual_size_centered" ? "edges" : "right and bottom edges"} fall off the paper. The client was told before ordering and kept this layout, so print it as agreed.`,
    });
    if (check.suggestedPaper) {
      notes.push({ tone: "cut_off", text: `${check.suggestedPaper.label} would have taken the whole page.` });
    }
  } else if (layout === "fit_to_paper" && check.scaleChanges === true) {
    const direction =
      check.exceedsPaper === true ? "Shrink" : pages.some((page) => page?.mixedPageSizes) ? "Scale" : "Enlarge";
    notes.push({
      tone: "scaled",
      text: `${direction} the page to fit ${paperName}. The drawing scale changes; the client was told before ordering.`,
    });
  } else if (layout === "fit_to_paper" && check.scaleChanges === false) {
    notes.push({ tone: "fits", text: `The page is already ${paperName} size, so nothing is scaled.` });
  } else if (layout !== "fit_to_paper" && check.exceedsPaper === false) {
    notes.push({ tone: "fits", text: `The page fits on ${paperName} at 100%.` });
  }

  const unread = new Set(check.unknown.map((entry) => entry.code));
  if (unread.has("paper_size_unknown")) {
    notes.push({ tone: "unread", text: "GRIDGO could not read a paper size from what the client chose. Check the paper before printing." });
  }
  const unreadPages = check.unknown.filter((entry) => entry.code === "page_size_unknown").length;
  if (unreadPages) {
    notes.push({
      tone: "unread",
      text: `GRIDGO could not read the page size of ${unreadPages === 1 ? (check.files.length > 1 ? "one file" : "the file") : `${unreadPages} files`}. Check it before printing.`,
    });
  }
  if (unread.has("no_artwork_file")) {
    notes.push({ tone: "unread", text: "There was no print file to measure when the client ordered." });
  }
  return { layout, rows, notes };
}

/* --------------------------------------------------------------------------
   The diagram
   -------------------------------------------------------------------------- */

export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Paper and page, placed the way the layout prints them, scaled into a box.
 *
 * The paper is turned to match the page's orientation (the shop feeds it
 * whichever way the page needs). The frame is the union of paper and page,
 * so what overhangs the paper — the part that is cut off — stays on screen.
 * Fit to paper also returns `original`, the page at actual size, so a shrink
 * or an enlargement shows instead of a page drawn exactly over the paper.
 */
export function layoutDiagram(
  layout: PrintLayoutCode,
  paper: { width: number; height: number },
  page: { width: number; height: number },
  box: { width: number; height: number },
): { paper: Rect; page: Rect; original: Rect | null } {
  const pageLandscape = page.width > page.height;
  const paperLandscape = paper.width > paper.height;
  const turned = pageLandscape !== paperLandscape ? { width: paper.height, height: paper.width } : paper;
  let placed: Rect;
  if (layout === "fit_to_paper") {
    const scale = Math.min(turned.width / page.width, turned.height / page.height);
    const width = page.width * scale;
    const height = page.height * scale;
    placed = { x: (turned.width - width) / 2, y: (turned.height - height) / 2, width, height };
  } else if (layout === "actual_size_centered") {
    placed = {
      x: (turned.width - page.width) / 2,
      y: (turned.height - page.height) / 2,
      width: page.width,
      height: page.height,
    };
  } else {
    placed = { x: 0, y: 0, width: page.width, height: page.height };
  }
  const original: Rect | null =
    layout === "fit_to_paper"
      ? {
          x: (turned.width - page.width) / 2,
          y: (turned.height - page.height) / 2,
          width: page.width,
          height: page.height,
        }
      : null;
  const shapes = [placed, ...(original ? [original] : [])];
  const left = Math.min(0, ...shapes.map((rect) => rect.x));
  const top = Math.min(0, ...shapes.map((rect) => rect.y));
  const right = Math.max(turned.width, ...shapes.map((rect) => rect.x + rect.width));
  const bottom = Math.max(turned.height, ...shapes.map((rect) => rect.y + rect.height));
  const scale = Math.min(box.width / (right - left), box.height / (bottom - top));
  const offsetX = (box.width - (right - left) * scale) / 2;
  const offsetY = (box.height - (bottom - top) * scale) / 2;
  const fit = (rect: Rect): Rect => ({
    x: offsetX + (rect.x - left) * scale,
    y: offsetY + (rect.y - top) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  });
  return { paper: fit({ x: 0, y: 0, ...turned }), page: fit(placed), original: original ? fit(original) : null };
}

/**
 * A generic picture of each layout for the listing editor: a page bigger
 * than A4 paper. Squarer than the paper, so fitting it visibly leaves margins
 * rather than drawing the page exactly over the paper.
 */
export const SAMPLE_PAPER = { width: 210, height: 297 };
export const SAMPLE_PAGE = { width: 290, height: 340 };
