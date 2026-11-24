import type { Order } from "@/lib/api";
import { ApiError, apiErrorCode } from "@/lib/apiErrors";

/**
 * Express document orders (gridgo-api `docs/EXPRESS_API.md`): a client sends
 * files to a nearby open shop, which has **five elapsed minutes** to answer.
 * A decline or no answer moves the order to the next nearest Express shop;
 * the shop that let it go simply loses it — nothing goes on its record.
 *
 * This is the only place `orderType`, `expressOrder` and the counter-code
 * refusals are read. The older `express: true` tag (`lib/express.ts`) is a
 * scheduling promise on an ordinary order and is a different thing.
 *
 * Production, finished-work evidence, GRIDGO's QA and the ready step are
 * today's; only acceptance and, for pickup, the hand-over differ: the shop
 * closes a pickup order by typing the client's six-digit counter code.
 */

export type ExpressPaper = "a4" | "short" | "long";
export type ExpressLayout = "fit_to_paper" | "actual_size_centered" | "actual_size_original_position";

/** One file as the shop prints it. Every field is read defensively. */
export type ExpressPrint = {
  fileId: string | null;
  /** Pages printed from this file per copy; null when GRIDGO sent no count. */
  pages: number | null;
  /** "1-3, 5", or null for every page. */
  range: string | null;
  totalPages: number | null;
  copies: number;
  paper: string;
  colour: "bw" | "colour" | null;
  sides: "one" | "two" | null;
  layout: string | null;
  paperStock: string | null;
  note: string;
  /**
   * Whose prints these are on a group order (gridgo-api
   * `docs/GROUP_EXPRESS_API.md`): one bundle per person, labelled with the
   * name GRIDGO sends. Null on every ordinary order.
   */
  member: ExpressMember | null;
};

export type ExpressMember = { id: string; name: string };

/** A group order: one Express order the host paid for, packed per person. */
export type ExpressGroup = {
  /** People in the group, host included; null when GRIDGO sent no count. */
  memberCount: number | null;
  /** Who collects every bundle; null when GRIDGO sent no name. */
  hostName: string | null;
};

/** One person's prints on a group order, packed and labelled together. */
export type ExpressBundle = {
  member: ExpressMember;
  prints: ExpressPrint[];
  /** Printed pages in this bundle; null when a file has no count. */
  totalPages: number | null;
};

export type ExpressView = {
  status: string;
  /** When the five minutes run out; null once answered. */
  acceptBy: string | null;
  fulfillment: "pickup" | "delivery";
  prints: ExpressPrint[];
  /** Printed pages across every file and copy. */
  totalPages: number | null;
  /** The client collected it with the counter code. */
  pickedUp: boolean;
  /** Null unless the order is a group order. */
  group: ExpressGroup | null;
};

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : null;
const str = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;

/** An order placed through Express's document flow. */
export function isExpressDocumentOrder(order: Partial<Pick<Order, "orderType">> | null | undefined): boolean {
  return order?.orderType === "express";
}

function readPrint(raw: unknown): ExpressPrint | null {
  const row = obj(raw);
  if (!row) return null;
  const pages = obj(row.pages);
  const colour = row.colour === "bw" || row.colour === "colour" ? row.colour : null;
  const sides = row.sides === "one" || row.sides === "two" ? row.sides : null;
  return {
    fileId: str(row.fileId),
    pages: count(pages?.printed),
    range: str(pages?.range),
    totalPages: count(pages?.total),
    copies: count(row.copies) ?? 1,
    paper: str(row.paper) ?? "",
    colour,
    sides,
    layout: str(row.layout),
    paperStock: str(row.paperStock),
    note: typeof row.note === "string" ? row.note.trim() : "",
    member: readMember(row),
  };
}

function readMember(row: Raw): ExpressMember | null {
  const id = str(row.groupMemberId);
  const name = typeof row.groupMemberName === "string" ? row.groupMemberName.trim() : "";
  return id && name ? { id, name } : null;
}

/** Whose bundle a production line goes in on a group order; null on every other line. */
export function itemMemberName(item: { groupMember?: unknown }): string | null {
  const member = obj(item.groupMember);
  const name = typeof member?.name === "string" ? member.name.trim() : "";
  return name || null;
}

/** The group tag's facts, or null for an ordinary order. */
export function expressGroup(order: Partial<Pick<Order, "groupOrder">> | null | undefined): ExpressGroup | null {
  const raw = obj(order?.groupOrder);
  if (!raw) return null;
  const host = typeof raw.hostName === "string" ? raw.hostName.trim() : "";
  return { memberCount: count(raw.memberCount), hostName: host || null };
}

/** "Group order, 4 people", or "Group order" when GRIDGO sent no count. */
export function groupTagLabel(group: ExpressGroup): string {
  const n = group.memberCount;
  return n == null ? "Group order" : `Group order, ${n} ${n === 1 ? "person" : "people"}`;
}

/**
 * The prints split into one bundle per person, in the order GRIDGO lists the
 * files. Null unless this is a group order and **every** file names its
 * person: a half-labelled list would let a shop pack someone's pages into the
 * wrong bundle, so it stays one plain list instead.
 */
export function expressBundles(view: ExpressView): ExpressBundle[] | null {
  if (!view.group || !view.prints.length || view.prints.some((print) => !print.member)) return null;
  const bundles = new Map<string, ExpressBundle>();
  for (const print of view.prints) {
    const member = print.member as ExpressMember;
    const bundle = bundles.get(member.id) ?? { member, prints: [], totalPages: 0 };
    bundle.prints.push(print);
    bundles.set(member.id, bundle);
  }
  return [...bundles.values()].map((bundle) => ({
    ...bundle,
    totalPages: bundle.prints.every((print) => print.pages != null)
      ? bundle.prints.reduce((sum, print) => sum + (print.pages ?? 0) * print.copies, 0)
      : null,
  }));
}

/** The Express side of an order, or null for every other order. */
export function expressView(
  order: Partial<Pick<Order, "orderType" | "expressOrder" | "fulfillmentMode" | "groupOrder">> | null | undefined,
): ExpressView | null {
  if (!order || !isExpressDocumentOrder(order)) return null;
  const raw = obj(order.expressOrder) ?? {};
  const prints = (Array.isArray(raw.printSettings) ? raw.printSettings : [])
    .map(readPrint)
    .filter((row): row is ExpressPrint => row != null);
  const known = prints.every((print) => print.pages != null);
  return {
    status: str(raw.status) ?? "sending",
    acceptBy: str(raw.acceptBy),
    fulfillment: order.fulfillmentMode === "delivery" ? "delivery" : "pickup",
    prints,
    totalPages: prints.length && known ? prints.reduce((sum, p) => sum + (p.pages ?? 0) * p.copies, 0) : null,
    pickedUp: raw.status === "picked_up",
    group: expressGroup(order),
  };
}

/** "2 files · 14 pages" under a person's name. */
export function bundleLine(bundle: ExpressBundle): string {
  const files = bundle.prints.length === 1 ? "1 file" : `${bundle.prints.length} files`;
  const pages =
    bundle.totalPages == null ? null : bundle.totalPages === 1 ? "1 page" : `${bundle.totalPages} pages`;
  return [files, pages].filter(Boolean).join(" · ");
}

/** The line under "Pack each person separately": who ends up with every bundle. */
export function bundleHint(view: ExpressView): string {
  const host = view.group?.hostName;
  const label = "Write each name on its bundle.";
  if (view.fulfillment === "delivery") {
    return host ? `${label} The rider takes them all to ${host}, the host.` : `${label} The rider takes them all to the host.`;
  }
  return host ? `${label} ${host}, the host, collects them all.` : `${label} The host collects them all.`;
}

const PAPER: Record<string, string> = { a4: "A4", short: "Short", long: "Long" };
const LAYOUT: Record<string, string> = {
  fit_to_paper: "Fit to page",
  actual_size_centered: "Actual size",
  actual_size_original_position: "Actual size, top-left",
};

/** The chips under a file, in the order a printer sets them up. */
export function printChips(print: ExpressPrint): string[] {
  return [
    print.pages != null ? (print.pages === 1 ? "1 page" : `${print.pages} pages`) : null,
    `× ${print.copies}`,
    PAPER[print.paper] ?? (print.paper || null),
    print.colour === "bw" ? "B&W" : print.colour === "colour" ? "Colour" : null,
    print.sides === "two" ? "2-sided" : print.sides === "one" ? "1-sided" : null,
    print.layout ? (LAYOUT[print.layout] ?? null) : null,
  ].filter((chip): chip is string => Boolean(chip));
}

/** "Pages 1-3, 5 of 8" when only part of the file prints. */
export function rangeLine(print: ExpressPrint): string | null {
  if (!print.range) return null;
  return print.totalPages ? `Pages ${print.range} of ${print.totalPages}` : `Pages ${print.range}`;
}

/** Reasons a shop gives in one tap. GRIDGO takes free text; these are only words. */
export const EXPRESS_DECLINE_REASONS = [
  "Printer is down",
  "Out of paper or ink",
  "Too many jobs right now",
  "Closing soon",
] as const;

/** The hand-over code: six digits, leading zeroes kept. */
export const COUNTER_CODE_LENGTH = 6;
export function counterCodeDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, COUNTER_CODE_LENGTH);
}

/** A pickup order ready at the counter, waiting for the client's code. */
export function awaitsCounterCode(
  order: Partial<Pick<Order, "orderType" | "expressOrder" | "fulfillmentMode" | "state">> | null | undefined,
): boolean {
  const view = expressView(order);
  return Boolean(view && view.fulfillment === "pickup" && order?.state === "ready_for_dispatch" && !view.pickedUp);
}

export type CounterCodeOutcome =
  | { kind: "wrong" }
  | { kind: "locked"; until: Date | null }
  | { kind: "other"; error: unknown };

/** What a refused code means, so the screen never reads an error code. */
export function counterCodeOutcome(error: unknown, now: Date = new Date()): CounterCodeOutcome {
  const code = apiErrorCode(error);
  if (code === "express_pickup_code_mismatch") return { kind: "wrong" };
  if (code === "express_pickup_attempts_exceeded") {
    const body = error instanceof ApiError ? obj(error.body) : null;
    const at = Date.parse(str(body?.retryAfter) ?? "");
    return { kind: "locked", until: Number.isFinite(at) && at > now.getTime() ? new Date(at) : null };
  }
  return { kind: "other", error };
}
