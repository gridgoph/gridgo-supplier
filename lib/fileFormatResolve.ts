import {
  FORMAT_QUERY_MAX,
  UNOPENED_FILE_MESSAGE,
  type PublishedFileFormat,
} from "@/data/fileFormats";

export type FormatResolution = {
  status: "empty" | "matched" | "link_only" | "unknown";
  query: string;
  format: PublishedFileFormat | null;
  message: string | null;
};

/** Same normalisation GRIDGO uses on `GET /accepted-file-formats?q=`. */
export function normalizeFormatQuery(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\./, "")
    .replace(/[\s\-_]+/g, "");
}

/**
 * Find a governed type from what a shop typed in the plus field.
 *
 * A match is a code already in the registry that GRIDGO can store (a file) or
 * accept as a URL. 3MF/STL and anything GRIDGO has no sniff for resolve to the
 * same sentence: take a link. The plus never invents a code.
 */
export function resolveFormatQuery(
  query: string,
  formats: readonly PublishedFileFormat[],
): FormatResolution {
  const trimmed = query.trim();
  if (!trimmed) return { status: "empty", query: "", format: null, message: null };
  const clipped = trimmed.slice(0, FORMAT_QUERY_MAX);
  const needle = normalizeFormatQuery(clipped);
  const match = formats.find((format) => format.aliases.includes(needle) || normalizeFormatQuery(format.code) === needle
    || normalizeFormatQuery(format.name) === needle);
  if (!match) {
    return { status: "unknown", query: clipped, format: null, message: UNOPENED_FILE_MESSAGE };
  }
  if (match.inputKind === "url" || match.uploadable) {
    return { status: "matched", query: clipped, format: match, message: null };
  }
  return { status: "link_only", query: clipped, format: match, message: UNOPENED_FILE_MESSAGE };
}

export function uploadedFileOptions(
  formats: readonly PublishedFileFormat[],
  selected: readonly string[],
): PublishedFileFormat[] {
  return formats.filter(
    (format) => format.inputKind === "file" && (format.uploadable || selected.includes(format.code)),
  );
}

export function linkFileOptions(formats: readonly PublishedFileFormat[]): PublishedFileFormat[] {
  return formats.filter((format) => format.inputKind === "url");
}

/** The platform list, as the shop app needs it. Unknown shapes become []. */
export function readPublishedFormats(body: unknown): PublishedFileFormat[] {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const list = (body as { formats?: unknown }).formats;
  if (!Array.isArray(list)) return [];
  const formats: PublishedFileFormat[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const code = typeof record.code === "string" ? record.code.trim() : "";
    if (!code) continue;
    const name =
      (typeof record.displayName === "string" && record.displayName.trim())
      || (typeof record.name === "string" && record.name.trim())
      || code;
    const inputKind = record.inputKind === "url" ? "url" : "file";
    const aliases = Array.isArray(record.aliases)
      ? record.aliases.filter((alias): alias is string => typeof alias === "string" && alias.length > 0)
      : [normalizeFormatQuery(code)];
    formats.push({
      code,
      name,
      inputKind,
      uploadable: record.uploadable === true,
      aliases,
    });
  }
  return formats;
}
