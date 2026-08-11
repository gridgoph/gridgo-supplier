#!/usr/bin/env node
/**
 * Prove a production export ships no demo sign-in credentials.
 *
 * The development prefill in `lib/devLogin.ts` lives behind
 * `__DEV__ ? { … } : null`, which Metro substitutes at bundle time so a
 * production build folds to `null` and drops the literals. That is an
 * argument about what the compiler *should* do. This asserts against what it
 * actually emitted.
 *
 * Usage:
 *
 *   node scripts/assert-no-dev-credentials.mjs --dir dist
 *   npx expo export --platform web --output-dir /tmp/gg-out && \
 *     node scripts/assert-no-dev-credentials.mjs --dir /tmp/gg-out
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

/** Live and retired fixture domains. */
const ACCOUNT_ADDRESS = /[A-Za-z0-9._%+-]+@gridgo\.(?:ph|local)\b/g;
/** gridgo-api DEMO_PASSWORD — the local fixture only. */
const DEMO_PASSWORD = "Ilovegridgo-0990";

/** Text artefacts plus Hermes bytecode (string literals stay readable in .hbc). */
const SCANNED_EXTENSIONS = [
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".txt",
  ".css",
  ".map",
  ".hbc",
  ".bundle",
];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

function fail(message, ...detail) {
  console.error(`assert-no-dev-credentials: ${message}`);
  for (const line of detail) console.error(`  ${line}`);
  process.exit(1);
}

const outDir = resolve(arg("dir") ?? process.env.EXPO_EXPORT_DIR ?? "dist");

function filesIn(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  const found = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...filesIn(full));
    } else if (SCANNED_EXTENSIONS.some((ext) => full.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

const files = filesIn(outDir);

if (files.length === 0) {
  fail(
    `found no export output under ${outDir}.`,
    "Run a production export first, or point --dir at the output.",
  );
}

const addressHits = [];
const passwordHits = [];

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const addresses = text.match(ACCOUNT_ADDRESS);
  if (addresses) {
    addressHits.push({
      file: relative(outDir, file),
      found: [...new Set(addresses)],
    });
  }
  if (text.includes(DEMO_PASSWORD)) {
    passwordHits.push(relative(outDir, file));
  }
}

if (addressHits.length > 0 || passwordHits.length > 0) {
  fail(
    "production export contains demo sign-in credentials.",
    "A released build must not ship the pilot address or password.",
    ...addressHits.map(({ file, found }) => `${file}: ${found.join(", ")}`),
    ...passwordHits.map((file) => `${file}: ${DEMO_PASSWORD}`),
    "Keep credentials behind the __DEV__ guard in lib/devLogin.ts.",
  );
}

console.log(
  `assert-no-dev-credentials: OK — no demo credentials in ${files.length} artefacts under ${outDir}.`,
);
