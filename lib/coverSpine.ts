import type { ProductionItem } from "@/lib/api";

/**
 * A hardbound book's cover and spine, as the client agreed it at checkout
 * (gridgo-client#247, gridgo-api `docs/HARDBOUND_COVER_API.md`).
 *
 * Only a Binding & hardbound line carries it; every other line, and every
 * order placed before the form existed, has `coverSpine: null` and draws
 * nothing new. A line whose product asked but whose client gave nothing is
 * `not_given`: the shop asks before it letters anything. The shop works out
 * the board and spine sizes itself, so nothing here measures anything.
 */

export type CoverChoice = "first_page" | "separate_file" | "text_only";

export type SpineDetails = {
  institutionCode: string | null;
  title: string;
  author: string;
  month: number;
  year: number;
};

export type AgreedCoverSpine =
  | { status: "not_given" }
  | {
    status: "given";
    cover: CoverChoice | null;
    /** The separate cover page: one of the line's own artwork files. */
    coverFileId: string | null;
    spine: SpineDetails;
    /** GRIDGO's "October 2026". */
    spineDate: string;
  };

export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function whole(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function coverChoice(value: unknown): CoverChoice | null {
  return value === "first_page" || value === "separate_file" || value === "text_only" ? value : null;
}

/** "October 2026", or as much of it as there is. */
export function spineDateLabel(month: number | null, year: number | null): string {
  const name = month != null && month >= 1 && month <= 12 ? MONTH_NAMES[month - 1] : "";
  return [name, year != null ? String(year) : ""].filter(Boolean).join(" ");
}

/** The line's agreed cover and spine, or null when its product never asked. */
export function agreedCoverSpine(item: Pick<ProductionItem, "coverSpine">): AgreedCoverSpine | null {
  const raw = item.coverSpine;
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const spine = record.spine && typeof record.spine === "object" ? (record.spine as Record<string, unknown>) : null;
  if (record.status !== "given" || !spine) return { status: "not_given" };
  const month = whole(spine.month);
  const year = whole(spine.year);
  const cover = coverChoice(record.cover);
  return {
    status: "given",
    cover,
    coverFileId: cover === "separate_file" && text(record.coverFileId) ? text(record.coverFileId) : null,
    spine: {
      institutionCode: text(spine.institutionCode) || null,
      title: text(spine.title),
      author: text(spine.author),
      month: month ?? 0,
      year: year ?? 0,
    },
    spineDate: text(record.spineDate) || spineDateLabel(month, year),
  };
}

/** How the cover is made, said as an agreed fact. */
export function coverLabel(cover: CoverChoice | null): string {
  switch (cover) {
    case "first_page":
      return "First page of the file";
    case "separate_file":
      return "Separate cover page";
    case "text_only":
      return "Plain cover, text only";
    default:
      return "Not given";
  }
}

export type SpineLine = { field: "institutionCode" | "title" | "author" | "date"; text: string };

/** The spine top to bottom: institution code (when given), title, author, month and year. */
export function spineLines(record: Extract<AgreedCoverSpine, { status: "given" }>): SpineLine[] {
  const { spine } = record;
  return [
    ...(spine.institutionCode ? [{ field: "institutionCode" as const, text: spine.institutionCode }] : []),
    { field: "title", text: spine.title },
    { field: "author", text: spine.author },
    { field: "date", text: record.spineDate },
  ];
}

export type CoverSpineRow = { label: string; value: string; muted?: boolean };

/** The agreed-spec rows for one line, in the order the spine reads. */
export function coverSpineRows(record: AgreedCoverSpine): CoverSpineRow[] {
  if (record.status !== "given") return [{ label: "Cover and spine", value: "Not given", muted: true }];
  const { spine } = record;
  return [
    { label: "Cover", value: coverLabel(record.cover), muted: record.cover == null },
    ...(spine.institutionCode ? [{ label: "Institution code", value: spine.institutionCode }] : []),
    { label: "Title on spine", value: spine.title },
    { label: "Author", value: spine.author },
    { label: "Month and year", value: record.spineDate },
  ];
}
