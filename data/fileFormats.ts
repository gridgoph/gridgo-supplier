/**
 * The artwork a client may send, as the design settles it.
 *
 * Super Admin governs this registry — a shop picks from it and never adds to
 * it. These twelve are what `docs/SUPPLIER_CATALOG_API.md` seeds, and the codes
 * here are exactly its codes. A deployment whose store predates a code still
 * refuses it, and that refusal reaches the screen as a sentence naming the one
 * format rather than being swallowed.
 *
 * This is the chart the app falls back to while the platform list is unreachable,
 * exactly as `data/serviceCatalog.ts` is for the category chart: display only.
 * Live listings prefer `GET /accepted-file-formats`, which also says which file
 * types GRIDGO can actually store (`uploadable`) and which words resolve to
 * which code (`aliases`).
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
  /**
   * Whether `POST /files` can sniff this as artwork. Link types are false.
   * 3MF/STL stay false until GRIDGO grows a model-file sniff.
   */
  uploadable: boolean;
  /** Words a shop might type in the plus field, already normalised. */
  aliases: string[];
};

export const FORMAT_QUERY_MAX = 40;

export const UNOPENED_FILE_MESSAGE =
  "GRIDGO can't take that file yet. Tick Any other https link so they can send a Drive or WeTransfer file.";

export const PUBLISHED_FILE_FORMATS: readonly PublishedFileFormat[] = [
  { code: "pdf", name: "PDF", inputKind: "file", uploadable: true, aliases: ["pdf"] },
  { code: "png", name: "PNG", inputKind: "file", uploadable: true, aliases: ["png"] },
  { code: "jpeg", name: "JPEG", inputKind: "file", uploadable: true, aliases: ["jpeg", "jpg"] },
  { code: "webp", name: "WebP", inputKind: "file", uploadable: true, aliases: ["webp"] },
  {
    code: "psd",
    name: "Photoshop (PSD)",
    inputKind: "file",
    uploadable: true,
    aliases: ["psd", "photoshop", "adobephotoshop"],
  },
  { code: "3mf", name: "3MF", inputKind: "file", uploadable: false, aliases: ["3mf"] },
  { code: "stl", name: "STL", inputKind: "file", uploadable: false, aliases: ["stl"] },
  { code: "canva_link", name: "Canva", inputKind: "url", uploadable: false, aliases: ["canva", "canvalink"] },
  {
    code: "google_drive",
    name: "Google Drive",
    inputKind: "url",
    uploadable: false,
    aliases: ["googledrive", "drive", "gdrive"],
  },
  { code: "dropbox", name: "Dropbox", inputKind: "url", uploadable: false, aliases: ["dropbox"] },
  {
    code: "we_transfer",
    name: "WeTransfer",
    inputKind: "url",
    uploadable: false,
    aliases: ["wetransfer"],
  },
  {
    code: "other_link",
    name: "Any other https link",
    inputKind: "url",
    uploadable: false,
    aliases: ["other", "otherlink", "link", "url", "https"],
  },
] as const;

/** Files GRIDGO will store from a client upload. */
export const UPLOADED_FILE_FORMATS = PUBLISHED_FILE_FORMATS.filter(
  (format) => format.inputKind === "file" && format.uploadable,
);

/** Places a client can point at instead of uploading. */
export const LINK_FILE_FORMATS = PUBLISHED_FILE_FORMATS.filter(
  (format) => format.inputKind === "url",
);

/** A code's shop-facing name, falling back to the code so nothing renders blank. */
export function fileFormatName(code: string, formats: readonly PublishedFileFormat[] = PUBLISHED_FILE_FORMATS): string {
  return formats.find((format) => format.code === code)?.name ?? code;
}

export function isLinkFormat(code: string, formats: readonly PublishedFileFormat[] = PUBLISHED_FILE_FORMATS): boolean {
  return formats.find((format) => format.code === code)?.inputKind === "url";
}

/** "Accept a Canva link on this listing" — the checkbox's own sentence. */
export function linkFormatInvitation(code: string, formats: readonly PublishedFileFormat[] = PUBLISHED_FILE_FORMATS): string {
  return `Accept a ${fileFormatName(code, formats)} link on this listing`;
}
