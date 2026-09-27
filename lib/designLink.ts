import type { ArtworkLink, Order } from "@/lib/api";

/**
 * Design links: the client's artwork kept on Canva, Google Drive, Dropbox or
 * WeTransfer rather than uploaded as a file.
 *
 * `docs/ORDER_MATCH_API.md#artwork-design-links` in gridgo-api is the
 * contract. An order line carries `artworkLinks: [{ formatCode, url }]`, up to
 * three, beside or instead of `artworkFileId`, and this shop sees only its own
 * job's lines. Two rules shape what a screen may say:
 *
 * - A link **is** artwork. A job whose only artwork is a link must never read
 *   "No print file" — that is a shop told it has nothing to print while the
 *   design is one tap away.
 * - GRIDGO keeps the address, not the bytes. The client's sharing settings or
 *   the design itself can change after checkout, so a link that will not open
 *   is a question for Operations, not a dead end.
 */

export type LinkProvider = "canva" | "google_drive" | "dropbox" | "we_transfer" | "other";

export type DesignLink = ArtworkLink & { provider: LinkProvider; itemName?: string };

const PROVIDER_NAMES: Record<LinkProvider, string> = {
  canva: "Canva",
  google_drive: "Google Drive",
  dropbox: "Dropbox",
  we_transfer: "WeTransfer",
  other: "Web",
};

const CODE_PROVIDERS: Record<string, LinkProvider> = {
  canva_link: "canva",
  google_drive: "google_drive",
  dropbox: "dropbox",
  we_transfer: "we_transfer",
};

function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseHttps(url: string): URL | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname ? parsed : null;
  } catch {
    return null;
  }
}

/** The provider by address, on the same host boundaries gridgo-api files each code under. */
function providerOfHost(url: string): LinkProvider {
  const host = parseHttps(url)?.hostname.toLowerCase().replace(/\.$/, "") ?? "";
  if (onDomain(host, "canva.com") || host === "canva.link") return "canva";
  if (host === "drive.google.com" || host === "docs.google.com") return "google_drive";
  if (onDomain(host, "dropbox.com") || onDomain(host, "dropboxusercontent.com")) return "dropbox";
  if (onDomain(host, "wetransfer.com") || host === "we.tl") return "we_transfer";
  return "other";
}

/**
 * Who hosts the design. The format code wins; an `other_link` (older clients
 * filed Drive links that way) or a code this app does not know yet falls back
 * to the address, so a Drive link still reads as Google Drive.
 */
export function linkProvider(link: ArtworkLink): LinkProvider {
  return CODE_PROVIDERS[link.formatCode] ?? providerOfHost(link.url);
}

export function providerName(provider: LinkProvider): string {
  return PROVIDER_NAMES[provider];
}

/** "Canva link", "Google Drive link", "Web link". */
export function linkLabel(link: Pick<DesignLink, "provider">): string {
  return `${providerName(link.provider)} link`;
}

/**
 * The address a shop can read: host and path, without `https://`, `www.` or
 * the query. Two Canva links differ only in the design id, so the path stays.
 */
export function linkDisplay(url: string): string {
  const parsed = parseHttps(url);
  if (!parsed) return url;
  const host = parsed.hostname.replace(/^www\./i, "");
  const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
  return `${host}${path}`;
}

/**
 * Every design link on the order, line by line, each address once.
 *
 * Only HTTPS survives: the contract stores nothing else, and a link this app
 * hands to the phone's browser must not be able to launch anything but a page.
 */
export function orderDesignLinks(order: Pick<Order, "productionItems">): DesignLink[] {
  const links: DesignLink[] = [];
  const seen = new Set<string>();
  for (const item of order.productionItems ?? []) {
    for (const link of Array.isArray(item.artworkLinks) ? item.artworkLinks : []) {
      if (!link || typeof link.url !== "string" || !parseHttps(link.url) || seen.has(link.url)) continue;
      seen.add(link.url);
      const formatCode = typeof link.formatCode === "string" ? link.formatCode : "other_link";
      links.push({
        formatCode,
        url: link.url,
        provider: linkProvider({ formatCode, url: link.url }),
        ...(item.itemName ? { itemName: item.itemName } : {}),
      });
    }
  }
  return links;
}

/**
 * The folded Artwork row's line when the design came as a link and nothing
 * was uploaded. Said plainly, because a shop scanning for "print file" would
 * otherwise read the job as having none.
 */
export function linkOnlySummary(links: DesignLink[]): string {
  const providers = new Set(links.map((link) => link.provider));
  if (providers.size > 1) return `${links.length} design links only, no file uploaded`;
  const label = linkLabel(links[0]);
  return links.length === 1 ? `${label} only, no file uploaded` : `${links.length} ${label}s only, no file uploaded`;
}
