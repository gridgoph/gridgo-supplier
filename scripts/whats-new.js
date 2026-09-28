#!/usr/bin/env node
/* global __dirname */
/**
 * "What's new": from the repo into the GitHub Release the app reads.
 *
 * Each user-facing change adds one file to `whats-new/` holding one
 * plain-language bullet (see `whats-new/README.md`). A file per change, rather
 * than a shared list, is what keeps two pull requests, or a pull request and
 * the release commit below, from conflicting over the same lines.
 *
 *   node scripts/whats-new.js check           every pending note is well formed
 *   node scripts/whats-new.js notes           the release body's `## What's new` section
 *   node scripts/whats-new.js record <ver>    move the pending notes under `## <ver> (<label>)`
 *                                             in WHATS_NEW.md and delete their files
 *
 * Each note says what kind of change it is (`Kind: feature | improvement | fix`
 * on its first line; improvement when left out). A release is labelled by the
 * biggest kind it carries, so a release with one new feature and two fixes is a
 * "New feature" release. The label is written into the release body and the
 * history heading, and the app reads it back for Settings > What's new
 * (`lib/whatsNewHistory.ts`). The version numbers themselves stay CI's.
 *
 * `history` turns WHATS_NEW.md (plus, for a CI build, the notes about to ship
 * as that build) into the list `app.config.ts` bundles into the app, so the
 * installed version's notes and everything before it read offline.
 *
 * The app reads only that section, as plain bullets (`parseWhatsNew` in
 * `lib/appUpdate.ts`), so a release with no pending notes simply has none and
 * the prompt looks as it did before notes existed.
 *
 * Plain Node with no dependencies, so the release job can run it and jest can
 * require it.
 */
const fs = require("fs");
const path = require("path");

const PENDING_DIR = "whats-new";
const HISTORY_FILE = "WHATS_NEW.md";
const HISTORY_MARKER = "<!-- CI adds each release below this line. -->";
/** The app shows at most this much of one bullet (`WHATS_NEW_LIMITS` in lib/appUpdate.ts). */
const MAX_CHARS = 120;

/**
 * The kinds of change, smallest first, and the label a release carrying that
 * kind is given. Keep in step with `RELEASE_LABELS` in lib/whatsNewHistory.ts.
 */
const KINDS = ["fix", "improvement", "feature"];
const KIND_LABELS = { feature: "New feature", improvement: "Improvement", fix: "Fix" };
const DEFAULT_KIND = "improvement";
const KIND_LINE = /^kind:\s*(.*)$/i;
const VERSION = /^\d+\.\d+\.\d+$/;
/** `## 1.0.166` or `## 1.0.166 (Fix)` in WHATS_NEW.md. */
const HISTORY_HEADING = /^##\s+(\d+\.\d+\.\d+)(?:\s+\(([^)]+)\))?\s*$/;

/** The kind a label names, or `null`. Reads both "Fix" and "fix". */
function kindOfLabel(label) {
  const text = String(label ?? "").trim().toLowerCase();
  if (KINDS.includes(text)) return text;
  return KINDS.find((kind) => KIND_LABELS[kind].toLowerCase() === text) ?? null;
}

/** The biggest kind among some notes: what the release they ship in is called. */
function releaseKind(notes) {
  let best = -1;
  for (const note of notes) best = Math.max(best, KINDS.indexOf(note.kind ?? DEFAULT_KIND));
  return best === -1 ? DEFAULT_KIND : KINDS[best];
}

/** Splits an optional `Kind:` line off a note. */
function splitKind(lines) {
  const match = lines.length > 0 ? KIND_LINE.exec(lines[0]) : null;
  if (!match) return { kind: DEFAULT_KIND, rest: lines, problem: null };
  const kind = match[1].trim().toLowerCase();
  if (!KINDS.includes(kind)) {
    return { kind: null, rest: lines.slice(1), problem: `has "Kind: ${match[1].trim()}"; use feature, improvement or fix` };
  }
  return { kind, rest: lines.slice(1), problem: null };
}

/** Why a note cannot ship, or `null`. The notes are read by shops on a lock-free prompt. */
function noteProblem(allLines) {
  const { rest: lines, problem: kindProblem } = splitKind(allLines);
  if (kindProblem) return kindProblem;
  if (lines.length !== 1) return "must be exactly one line (one bullet), after an optional Kind: line";
  const [line] = lines;
  if (!line.startsWith("- ")) return 'must be one bullet starting "- "';
  const text = line.slice(2).trim();
  if (!text) return "is empty";
  if (text.length > MAX_CHARS) return `is ${text.length} characters; keep it to ${MAX_CHARS}`;
  if (/https?:\/\/|`|<[^>]*>|\]\(/.test(text)) {
    return "must be plain words: no links, code or HTML";
  }
  return null;
}

/** The pending notes, oldest pull request first. Throws on a malformed one. */
function pendingNotes(root) {
  const dir = path.join(root, PENDING_DIR);
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") && name !== "README.md")
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return files.map((name) => {
    const file = path.join(dir, name);
    const lines = fs
      .readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const problem = noteProblem(lines);
    if (problem) throw new Error(`${PENDING_DIR}/${name} ${problem}`);
    const { kind, rest } = splitKind(lines);
    return { file, kind, text: rest[0].slice(2).trim() };
  });
}

/**
 * The release body's section, or "" when nothing is pending. The label line
 * is not a bullet, so builds that only read bullets (`parseWhatsNew`) skip it.
 */
function releaseSection(notes) {
  if (notes.length === 0) return "";
  const label = KIND_LABELS[releaseKind(notes)];
  return `## What's new\n\nRelease type: ${label}\n\n${notes.map((note) => `- ${note.text}`).join("\n")}\n`;
}

/**
 * Files the pending notes under `## <version>` in WHATS_NEW.md, newest first,
 * and deletes them from `whats-new/`. Returns how many were recorded. Running
 * it twice for one version records nothing the second time.
 */
function recordRelease(root, version) {
  if (!VERSION.test(version)) throw new Error(`"${version}" is not a release version`);
  const notes = pendingNotes(root);
  if (notes.length === 0) return 0;
  const historyPath = path.join(root, HISTORY_FILE);
  const history = fs.readFileSync(historyPath, "utf8");
  if (!history.includes(HISTORY_MARKER)) throw new Error(`${HISTORY_FILE} has lost its marker line`);
  if (recordedReleases(history).some((release) => release.version === version)) return 0;
  const label = KIND_LABELS[releaseKind(notes)];
  const section = `\n## ${version} (${label})\n\n${notes.map((note) => `- ${note.text}`).join("\n")}`;
  fs.writeFileSync(historyPath, history.replace(HISTORY_MARKER, `${HISTORY_MARKER}\n${section}`));
  for (const note of notes) fs.unlinkSync(note.file);
  return notes.length;
}

/**
 * The releases WHATS_NEW.md records, in file order (CI writes newest first).
 * A heading with no label, or one this script does not know, reads as the
 * default kind rather than failing: the file is also edited by people.
 */
function recordedReleases(history) {
  const start = history.indexOf(HISTORY_MARKER);
  const lines = (start === -1 ? "" : history.slice(start + HISTORY_MARKER.length)).split(/\r?\n/);
  const releases = [];
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    const heading = HISTORY_HEADING.exec(line);
    if (heading) {
      current = { version: heading[1], kind: kindOfLabel(heading[2]) ?? DEFAULT_KIND, notes: [] };
      releases.push(current);
    } else if (/^#{1,6}\s/.test(line)) {
      current = null;
    } else if (current && line.startsWith("- ")) {
      const text = line.slice(2).trim();
      if (text) current.notes.push(text);
    }
  }
  return releases;
}

/**
 * Every release a build can show offline, newest first: WHATS_NEW.md, plus the
 * pending notes filed under `version` when this is a CI build of that version
 * (they are recorded there only after it ships). A local build passes no
 * version, and its pending notes, which belong to no release yet, are left out.
 *
 * Returns plain `{ version, kind, notes }` records for `app.config.ts` to put
 * in `extra.whatsNewHistory`.
 */
function releaseHistory(root, version) {
  const historyPath = path.join(root, HISTORY_FILE);
  const recorded = fs.existsSync(historyPath) ? recordedReleases(fs.readFileSync(historyPath, "utf8")) : [];
  const releases = [...recorded];
  if (version && VERSION.test(version) && !recorded.some((release) => release.version === version)) {
    const notes = pendingNotes(root);
    if (notes.length > 0) {
      releases.push({ version, kind: releaseKind(notes), notes: notes.map((note) => note.text) });
    }
  }
  return releases.sort((a, b) => compareVersions(b.version, a.version));
}

function compareVersions(a, b) {
  const x = a.split(".").map(Number);
  const y = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

module.exports = {
  HISTORY_MARKER,
  KIND_LABELS,
  MAX_CHARS,
  noteProblem,
  pendingNotes,
  recordRelease,
  recordedReleases,
  releaseHistory,
  releaseKind,
  releaseSection,
};

if (require.main === module) {
  const root = path.join(__dirname, "..");
  const [command, version] = process.argv.slice(2);
  try {
    if (command === "check") {
      console.log(`${pendingNotes(root).length} pending What's new note(s), all well formed`);
    } else if (command === "notes") {
      process.stdout.write(releaseSection(pendingNotes(root)));
    } else if (command === "record") {
      console.log(`recorded ${recordRelease(root, version ?? "")} note(s) under ${version}`);
    } else {
      throw new Error("usage: whats-new.js check | notes | record <version>");
    }
  } catch (error) {
    console.error(`::error::${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
