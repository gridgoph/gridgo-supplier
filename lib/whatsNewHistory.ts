/**
 * Account > What's new: every release's notes, newest first, each with a
 * label for the kind of release.
 *
 * There is one source. Each change adds a note to `whats-new/`; the release job
 * copies the notes into the GitHub Release and files them in `WHATS_NEW.md`
 * under `## <version> (<label>)` (`scripts/whats-new.js`). A build carries that
 * history with it: `app.config.ts` puts it in `extra.whatsNewHistory`, and a CI
 * build adds its own pending notes as its own version. So the installed
 * version, and everything before it, reads with no network.
 *
 * What a build cannot carry is a release made after it. Those are read from
 * the GitHub releases list when the page opens (`fetchReleaseHistory`), with
 * the same `## What's new` section the update prompt reads (`parseWhatsNew`).
 * Offline, the page shows the bundled history and says so calmly.
 *
 * Nothing here imports React Native or a store.
 */
import { CHECK_TIMEOUT_MS, LATEST_RELEASE_URL, USER_AGENT, parseWhatsNew } from "@/lib/appUpdate";

/**
 * The kind of release, as `scripts/whats-new.js` writes it. A release that
 * says nothing about itself (a body from before labels, or a label this build
 * does not know) has kind `null` and is drawn with no label: never a guess, and
 * never a pill that reads like an "Update" button.
 */
export type ReleaseKind = "feature" | "improvement" | "fix";

/** The words a shop reads for each kind. Keep in step with `KIND_LABELS` in the script. */
export const RELEASE_LABELS: Record<ReleaseKind, string> = {
  feature: "New feature",
  improvement: "Improvement",
  fix: "Fix",
};

/**
 * How each label is drawn: icon + label + colour, never colour alone. Only a
 * new feature takes a colour, so the releases that add something stand out
 * when the list is scanned; the rest stay quiet.
 */
export const RELEASE_LABEL_LOOK = {
  feature: { tone: "info", icon: "sparkles" },
  improvement: { tone: "neutral", icon: "trending-up" },
  fix: { tone: "neutral", icon: "wrench" },
} as const satisfies Record<ReleaseKind, { tone: string; icon: string }>;

export type ReleaseNotes = {
  /** What a shop reads, e.g. "1.0.171". */
  version: string;
  kind: ReleaseKind | null;
  /** Plain bullets. Never empty: a release with nothing to say is not listed. */
  notes: string[];
};

const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;

/** "1.0.171" as numbers, or `null` for anything CI does not write. */
function versionParts(version: string): [number, number, number] | null {
  const match = VERSION.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Newest first. The run number is the patch, so "1.0.99" comes after "1.0.100". */
export function compareVersionsDesc(a: string, b: string): number {
  const x = versionParts(a) ?? [0, 0, 0];
  const y = versionParts(b) ?? [0, 0, 0];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return y[i] - x[i];
  return 0;
}

/** The kind a word names ("fix", "Fix", "New feature"), else `null`. */
export function releaseKindOf(raw: unknown): ReleaseKind | null {
  const text = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  for (const kind of Object.keys(RELEASE_LABELS) as ReleaseKind[]) {
    if (kind === text || RELEASE_LABELS[kind].toLowerCase() === text) return kind;
  }
  return null;
}

function cleanNotes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((note): note is string => typeof note === "string" && note.trim() !== "")
    .map((note) => note.trim());
}

/**
 * The history this build carries (`extra.whatsNewHistory`), newest first.
 * Forgiving on purpose: a malformed entry is dropped, never a crash on the page.
 */
export function readBundledHistory(raw: unknown): ReleaseNotes[] {
  if (!Array.isArray(raw)) return [];
  const releases: ReleaseNotes[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const { version, kind, notes } = entry as Record<string, unknown>;
    if (typeof version !== "string" || !versionParts(version)) continue;
    const clean = cleanNotes(notes);
    if (clean.length === 0) continue;
    releases.push({ version: version.trim(), kind: releaseKindOf(kind), notes: clean });
  }
  return releases.sort((a, b) => compareVersionsDesc(a.version, b.version));
}

const RELEASE_TYPE_LINE = /^\s*release type:\s*(.+?)\s*$/im;

/**
 * One GitHub release as this page reads it, or `null` when it has nothing to
 * show: a draft, a pre-release, a tag CI did not write, or no notes.
 */
function releaseFromGitHub(raw: unknown): ReleaseNotes | null {
  if (!raw || typeof raw !== "object") return null;
  const release = raw as { tag_name?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown };
  if (release.draft === true || release.prerelease === true) return null;
  if (typeof release.tag_name !== "string") return null;
  const parts = versionParts(release.tag_name);
  if (!parts) return null;
  const notes = parseWhatsNew(release.body);
  if (notes.length === 0) return null;
  const body = typeof release.body === "string" ? release.body : "";
  const whatsNewAt = body.search(/^#{1,6}\s*what['’]?s\s+new\b/im);
  const label = whatsNewAt === -1 ? null : RELEASE_TYPE_LINE.exec(body.slice(whatsNewAt));
  return { version: parts.join("."), kind: releaseKindOf(label?.[1]), notes };
}

/** The GitHub releases list, as releases with notes, newest first. */
export function parseReleaseList(body: unknown): ReleaseNotes[] {
  if (!Array.isArray(body)) return [];
  return body
    .map(releaseFromGitHub)
    .filter((release): release is ReleaseNotes => release !== null)
    .sort((a, b) => compareVersionsDesc(a.version, b.version));
}

/**
 * The bundled history with any release read online that it does not have,
 * newest first. Where both know a version, the bundled one stands: it is what
 * this phone shipped with, and the release job wrote both from the same notes.
 */
export function mergeHistory(bundled: ReleaseNotes[], online: ReleaseNotes[]): ReleaseNotes[] {
  const known = new Set(bundled.map((release) => release.version));
  return [...bundled, ...online.filter((release) => !known.has(release.version))].sort((a, b) =>
    compareVersionsDesc(a.version, b.version),
  );
}

/** Where a release stands against this phone, when this phone is a CI build. */
export type ReleasePlace = "installed" | "newer" | "older";

export function releasePlace(version: string, installedVersion: string | null): ReleasePlace | null {
  if (!installedVersion) return null;
  const order = compareVersionsDesc(version, installedVersion);
  if (order === 0) return "installed";
  return order < 0 ? "newer" : "older";
}

/**
 * What the online read came back with: `offline` is no answer at all (no
 * network, a timeout); `unavailable` is an answer that was not the list (a
 * GitHub rate limit, say).
 */
export type HistoryRead = { releases: ReleaseNotes[]; outcome: "online" | "offline" | "unavailable" };

/** Releases a page reads at most; plenty, and one request. */
export const RELEASE_LIST_PAGE_SIZE = 30;

/** The releases list next to the latest-release URL the update prompt reads. */
export const RELEASE_LIST_URL = `${LATEST_RELEASE_URL.replace(/\/latest$/, "")}?per_page=${RELEASE_LIST_PAGE_SIZE}`;

/** Read the releases list. Never throws. */
export async function fetchReleaseHistory(
  fetchImpl: typeof fetch,
  { url = RELEASE_LIST_URL, timeoutMs = CHECK_TIMEOUT_MS }: { url?: string; timeoutMs?: number } = {},
): Promise<HistoryRead> {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let answered = false;
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT },
      signal: controller?.signal,
    });
    answered = true;
    if (!response.ok) return { releases: [], outcome: "unavailable" };
    const body: unknown = await response.json();
    if (!Array.isArray(body)) return { releases: [], outcome: "unavailable" };
    return { releases: parseReleaseList(body), outcome: "online" };
  } catch {
    return { releases: [], outcome: answered ? "unavailable" : "offline" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Where the online read stands. */
export type HistoryStatus = "idle" | "loading" | HistoryRead["outcome"];

export const WHATS_NEW_HISTORY_COPY = {
  title: "What's new",
  accountRow: "What's new",
  accountCaption: "What changed in each version of this app",
  intro: (installedVersion: string | null) =>
    installedVersion
      ? `This phone has version ${installedVersion}. Every release is here, newest first.`
      : "Every release is here, newest first.",
  installed: "On this phone",
  newer: "Not installed yet",
  offline:
    "You're offline, so this shows the notes that came with this version. Newer releases appear when you're back online.",
  unavailable:
    "Newer releases could not be checked just now, so this shows the notes that came with this version.",
  empty: "Release notes will appear here after the next update.",
} as const;

/** Read aloud for one release. */
export function releaseAccessibilityLabel(release: ReleaseNotes, place: ReleasePlace | null): string {
  const where =
    place === "installed" ? `, ${WHATS_NEW_HISTORY_COPY.installed}` : place === "newer" ? `, ${WHATS_NEW_HISTORY_COPY.newer}` : "";
  const label = release.kind ? `, ${RELEASE_LABELS[release.kind]}` : "";
  return `Version ${release.version}${label}${where}. ${release.notes.join(". ")}`;
}

/**
 * The notes this build carries for one version, or `[]`. What the "Update
 * completed" sheet and the "Updated to" card say about the build on this
 * phone: bundled, so they read with no network the moment the update lands.
 */
export function bundledNotesFor(bundled: ReleaseNotes[], version: string): string[] {
  return bundled.find((release) => release.version === version)?.notes ?? [];
}
