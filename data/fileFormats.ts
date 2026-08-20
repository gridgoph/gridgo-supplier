/**
 * The artwork a client may send, as the design settles it.
 *
 * Super Admin governs this registry — a shop picks from it and never adds to
 * it. These eleven are what `docs/SUPPLIER_CATALOG_API.md` seeds, and the codes
 * here are exactly its codes. A deployment whose store predates a code still
 * refuses it, and that refusal reaches the screen as a sentence naming the one
 * format rather than being swallowed.
 *
 * This is the chart the app falls back to while the platform serves no list of
 * its own, exactly as `data/serviceCatalog.ts` is for the category chart:
 * display only.
 *
 * The split matters on screen. A shop thinks about two different things — what
 * it can open, and where it will go and fetch from — so files and links are two
 * clusters, never one chip dump. `inputKind` is what separates them, and the
 * word `inputKind` never appears in front of a shop.
 */

export type PublishedFileFormat = {
  /** The governed code sent to GRIDGO. Never invented on the phone. */
  code: string;
  /** What a shop calls it. */
  name: string;
  /** A file the client uploads, or a link they paste. */
  inputKind: "file" | "url";
};

export const PUBLISHED_FILE_FORMATS: readonly PublishedFileFormat[] = [
  { code: "pdf", name: "PDF", inputKind: "file" },
  { code: "png", name: "PNG", inputKind: "file" },
  { code: "jpeg", name: "JPEG", inputKind: "file" },
  { code: "psd", name: "Photoshop (PSD)", inputKind: "file" },
  { code: "3mf", name: "3MF", inputKind: "file" },
  { code: "stl", name: "STL", inputKind: "file" },
  { code: "canva_link", name: "Canva", inputKind: "url" },
  { code: "google_drive", name: "Google Drive", inputKind: "url" },
  { code: "dropbox", name: "Dropbox", inputKind: "url" },
  { code: "we_transfer", name: "WeTransfer", inputKind: "url" },
  { code: "other_link", name: "Any other https link", inputKind: "url" },
] as const;

/** Files a client uploads. */
export const UPLOADED_FILE_FORMATS = PUBLISHED_FILE_FORMATS.filter(
  (format) => format.inputKind === "file",
);

/** Places a client can point at instead of uploading. */
export const LINK_FILE_FORMATS = PUBLISHED_FILE_FORMATS.filter(
  (format) => format.inputKind === "url",
);

/** A code's shop-facing name, falling back to the code so nothing renders blank. */
export function fileFormatName(code: string): string {
  return PUBLISHED_FILE_FORMATS.find((format) => format.code === code)?.name ?? code;
}

export function isLinkFormat(code: string): boolean {
  return PUBLISHED_FILE_FORMATS.find((format) => format.code === code)?.inputKind === "url";
}

/** "Accept a Canva link on this listing" — the checkbox's own sentence. */
export function linkFormatInvitation(code: string): string {
  return `Accept a ${fileFormatName(code)} link on this listing`;
}
