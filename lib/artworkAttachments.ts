import type { Order, ProductionItem } from "@/lib/api";
import { toDesignLink, type DesignLink } from "@/lib/designLink";

/**
 * Several files and design links on one item (gridgo-api
 * `docs/ORDER_MATCH_API.md`, "Multiple artwork attachments"; report C6625C57).
 *
 * A line's `artworkAttachments` is the client's own list: up to ten files and
 * links together, in the order the client put them, each with an optional
 * label ("Front", "Back", "Logo PDF"). Three rules the screens are built on:
 *
 * - **The order is the client's.** Entries are drawn as they come; nothing
 *   here sorts files ahead of links.
 * - **The first file is the main file.** It is `artworkFileId`, the one GRIDGO
 *   counts pages from and previews, so the shop is told which one it is.
 * - **An older order still reads.** A line without the array is its single
 *   file first, then its links — the same projection GRIDGO makes.
 */

export type AttachmentEntry =
  | {
    kind: "file";
    fileId: string;
    label: string | null;
    /** The first file on the line. */
    main: boolean;
    /** A signed link that arrived with the order, so a preview can draw without asking. */
    downloadUrl?: string;
    downloadUrlExpiresAt?: string;
  }
  | { kind: "link"; link: DesignLink; label: string | null };

export type AttachmentGroup = {
  itemId: string;
  itemName: string;
  entries: AttachmentEntry[];
};

function cleanLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function rawEntries(item: ProductionItem): unknown[] {
  if (Array.isArray(item.artworkAttachments)) return item.artworkAttachments;
  return [
    ...(item.artworkFileId ? [{ kind: "file", fileId: item.artworkFileId }] : []),
    ...(Array.isArray(item.artworkLinks) ? item.artworkLinks.map((link) => ({ ...link, kind: "link" })) : []),
  ];
}

/** One line's files and links, in the client's order, each file and address once. */
export function itemAttachments(item: ProductionItem): AttachmentEntry[] {
  const entries: AttachmentEntry[] = [];
  const seen = new Set<string>();
  let mainFound = false;
  for (const raw of rawEntries(item)) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    const label = cleanLabel(entry.label);
    if (entry.kind === "file") {
      const fileId = typeof entry.fileId === "string" ? entry.fileId : "";
      if (!fileId || seen.has(`file:${fileId}`)) continue;
      seen.add(`file:${fileId}`);
      entries.push({
        kind: "file",
        fileId,
        label,
        main: !mainFound,
        ...(typeof entry.downloadUrl === "string" ? { downloadUrl: entry.downloadUrl } : {}),
        ...(typeof entry.downloadUrlExpiresAt === "string" ? { downloadUrlExpiresAt: entry.downloadUrlExpiresAt } : {}),
      });
      mainFound = true;
    } else if (entry.kind === "link") {
      const link = toDesignLink(entry, item.itemName);
      if (!link || seen.has(`link:${link.url}`)) continue;
      seen.add(`link:${link.url}`);
      entries.push({ kind: "link", link, label });
    }
  }
  return entries;
}

/** Each line that has artwork, in the order's line order. */
export function attachmentGroups(order: Pick<Order, "productionItems">): AttachmentGroup[] {
  return (order.productionItems ?? [])
    .map((item) => ({ itemId: item.id, itemName: item.itemName, entries: itemAttachments(item) }))
    .filter((group) => group.entries.length > 0);
}

/**
 * Whether the job needs the attachment list rather than the single print-file
 * card: a line with more than one entry, or a label worth reading. An older
 * job with one file per line keeps the screen it always had.
 */
export function showsAttachmentList(order: Pick<Order, "productionItems">): boolean {
  return attachmentGroups(order).some((group) =>
    group.entries.length > 1 || group.entries.some((entry) => entry.label));
}

/** "3 files · 1 design link" for one line. */
export function attachmentCountLine(entries: AttachmentEntry[]): string {
  const files = entries.filter((entry) => entry.kind === "file").length;
  const links = entries.length - files;
  return [
    files ? `${files} ${files === 1 ? "file" : "files"}` : null,
    links ? `${links} ${links === 1 ? "design link" : "design links"}` : null,
  ].filter(Boolean).join(" · ");
}
