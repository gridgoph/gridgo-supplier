#!/usr/bin/env node
/**
 * Prove a production export ships nothing only a development build may show.
 *
 * Two classes of disclosure, one argument. The sign-in prefill in
 * `lib/devLogin.ts` and the connection line in `app/(auth)/login.tsx` both live
 * behind `__DEV__ ? … : null`, which Metro substitutes at bundle time so a
 * production build folds to `null` and drops the literals. That is an argument
 * about what the compiler *should* do. This asserts against what it actually
 * emitted.
 *
 * The connection line matters for the same reason the credentials do: this
 * screen is on a public address, so anything it can render, it renders to
 * whoever opens the app — and `GRIDGO on <host>` names infrastructure a print
 * shop cannot act on. A guard written as a branch *inside* the screen would
 * leave every one of those literals in the bundle while never rendering them,
 * which is the regression this file exists to catch.
 *
 * (The API base itself is inlined by design — `EXPO_PUBLIC_API_URL`, which
 * `scripts/verify-release-apk.sh` asserts is *present*. What must not ship is
 * the screen that shows it to a shop.)
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

/**
 * Literals only the development connection line can render.
 *
 * They all come from the one component, so it ships all of them or none — any
 * one of them surviving is the whole line surviving. `GRIDGO on ` is
 * deliberately *not* among them: the sign-out confirmation legitimately asks
 * "Sign out of GRIDGO on this phone?", and a check that fails on shipped copy
 * is a check that gets deleted.
 */
const DEV_ONLY_UI = ["on this network at", "No answer", "Answering"];
/** Secrets never belong in an Expo artefact; test publishable keys never belong in a release. */
const CLERK_SECRET_KEY = /sk_(?:test|live)_[A-Za-z0-9_-]{20,}/;
const CLERK_TEST_KEY = /pk_test_[A-Za-z0-9_-]{20,}/;
const THIS_APP_TEST_KEY = "pk_test_Y2FzdWFsLWNyYWItOS5jbGVyay5hY2NvdW50cy5kZXYk";
const CLERK_LIVE_KEY = /pk_live_[A-Za-z0-9_-]{20,}/;

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
const devUiHits = [];
const clerkSecretHits = [];
const clerkTestKeyHits = [];
let hasLiveClerkKey = false;

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
  const devUi = DEV_ONLY_UI.filter((literal) => text.includes(literal));
  if (devUi.length > 0) {
    devUiHits.push({ file: relative(outDir, file), found: devUi });
  }
  // Hermes stores unrelated string-table entries beside each other, so a
  // prefix example inside Clerk can appear concatenated with the next entry.
  // Generic key-shape checks are reliable in text bundles; Hermes is checked
  // against this app's exact development publishable key instead.
  const isHermes = file.endsWith(".hbc");
  if (!isHermes && CLERK_SECRET_KEY.test(text)) {
    clerkSecretHits.push(relative(outDir, file));
  }
  if (
    (!isHermes && CLERK_TEST_KEY.test(text)) ||
    text.includes(THIS_APP_TEST_KEY)
  ) {
    clerkTestKeyHits.push(relative(outDir, file));
  }
  if (CLERK_LIVE_KEY.test(text)) hasLiveClerkKey = true;
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

if (devUiHits.length > 0) {
  fail(
    "production export contains the development connection line.",
    "A released build must not name the API host to a print shop.",
    ...devUiHits.map(({ file, found }) => `${file}: ${found.join(", ")}`),
    "Keep it as a whole component behind __DEV__ at module scope in",
    "app/(auth)/login.tsx — a branch inside the screen still ships its literals.",
  );
}

if (clerkSecretHits.length > 0 || clerkTestKeyHits.length > 0) {
  fail(
    "production export contains a forbidden Clerk key.",
    "A release may contain only its public pk_live_ key.",
    ...clerkSecretHits.map((file) => `${file}: secret Clerk key marker`),
    ...clerkTestKeyHits.map((file) => `${file}: test Clerk publishable key marker`),
  );
}

if (!hasLiveClerkKey) {
  fail(
    "production export has no Clerk production publishable key.",
    "Build with a production pk_live_ Clerk publishable key.",
  );
}

console.log(
  `assert-no-dev-credentials: OK — no demo credentials and no development ` +
    `connection line or forbidden Clerk key in ${files.length} artefacts under ${outDir}.`,
);
