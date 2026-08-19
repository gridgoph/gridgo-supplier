/**
 * The artwork files GRIDGO accepts, as the design settles them.
 *
 * Super Admin governs this registry — a shop picks from it and never adds to
 * it. The revision-2 contract seeds at least these codes, and a Canva link is
 * deliberately a URL rather than a fake uploaded file.
 *
 * This is the chart the app falls back to while the platform has no published
 * list to serve, exactly as `data/serviceCatalog.ts` is for the category chart:
 * display only. `lib/listingsApi.ts` prefers whatever GRIDGO serves.
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
  { code: "canva_link", name: "Canva link", inputKind: "url" },
  { code: "3mf", name: "3MF", inputKind: "file" },
  { code: "stl", name: "STL", inputKind: "file" },
] as const;

/** A code's shop-facing name, falling back to the code so nothing renders blank. */
export function fileFormatName(code: string): string {
  return PUBLISHED_FILE_FORMATS.find((format) => format.code === code)?.name ?? code;
}
