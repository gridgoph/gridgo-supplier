#!/usr/bin/env node
/**
 * Release notes for a Play internal testing upload.
 *
 * `eas submit` uploads the bundle but carries no release notes, so testers saw
 * a release with nothing to say what changed. After the submit, the release
 * job runs this to set them on that same release through the Google Play
 * Developer API's edits flow, with the same service account EAS used.
 *
 *   node scripts/play-release-notes.mjs
 *
 * Reads from the environment:
 *   PLAY_SERVICE_ACCOUNT_KEY_PATH   the service-account JSON (a mode-600 temp file)
 *   PLAY_PACKAGE                    the app's package name
 *   PLAY_VERSION_CODE               the versionCode the submit uploaded
 *   PLAY_VERSION                    the version name, for picking its What's new
 *   PLAY_TRACK                      optional, default "internal"
 *
 * The notes are the app's own What's new for that version, the same lines the
 * update prompt shows (scripts/whats-new.js): newest change first, whole lines
 * only, within Play's 500-character limit for en-US.
 *
 * Plain Node with no dependencies. The key and the access token never reach
 * the log: errors carry an HTTP status and Google's own message only.
 */
import { Buffer } from "node:buffer";
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const whatsNew = require("./whats-new.js");

/** Play's limit for one language's release notes. */
export const PLAY_NOTES_LIMIT = 500;
export const NOTES_LANGUAGE = "en-US";
const MORE = "And more improvements in this version.";
const FALLBACK = "Fixes and improvements.";
const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const API = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";

/** Characters as Play counts them, not UTF-16 units. */
const length = (text) => [...text].length;

/**
 * The notes text for some What's new lines: newest first (the files are oldest
 * pull request first), one "• " line each, whole lines only. When some do not
 * fit, the last line says there is more, so a tester never reads a cut line.
 */
export function releaseNotesText(notes, limit = PLAY_NOTES_LIMIT) {
  const lines = [...notes].reverse().map((note) => `• ${note.trim()}`).filter((line) => line.length > 2);
  if (lines.length === 0) return FALLBACK;
  const kept = [];
  for (const [index, line] of lines.entries()) {
    const remaining = index < lines.length - 1;
    const next = [...kept, line];
    const room = remaining ? [...next, `• ${MORE}`] : next;
    if (length(room.join("\n")) > limit) {
      // This line does not fit with the "more" line after it. Stop here.
      return [...kept, `• ${MORE}`].join("\n");
    }
    kept.push(line);
  }
  return kept.join("\n");
}

/**
 * That version's What's new lines: the pending notes when this build carries
 * them, else the newest release WHATS_NEW.md records (a build made right after
 * a release ships those changes too). `releaseHistory` is newest first.
 */
export function notesForVersion(root, version) {
  const [newest] = whatsNew.releaseHistory(root, version);
  return newest ? newest.notes : [];
}

/** The track update: the release with that versionCode gets the notes, the others are left as they are. */
export function withReleaseNotes(track, versionCode, text) {
  const code = String(versionCode);
  const releases = track.releases ?? [];
  const target = releases.find((release) => (release.versionCodes ?? []).map(String).includes(code));
  if (!target) {
    throw new Error(`the ${track.track} track has no release with versionCode ${code}`);
  }
  return {
    track: track.track,
    releases: releases.map((release) =>
      release === target ? { ...release, releaseNotes: [{ language: NOTES_LANGUAGE, text }] } : release,
    ),
  };
}

/** The notes on the release with that versionCode, or null. */
export function notesOnRelease(track, versionCode) {
  const code = String(versionCode);
  const release = (track.releases ?? []).find((r) => (r.versionCodes ?? []).map(String).includes(code));
  return release?.releaseNotes?.find((note) => note.language === NOTES_LANGUAGE)?.text ?? null;
}

const base64url = (value) => Buffer.from(value).toString("base64url");

/** A signed service-account assertion (RFC 7523), exchanged for an access token. */
export function serviceAccountAssertion(key, now = Math.floor(Date.now() / 1000)) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: key.token_uri || "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(key.private_key, "base64url")}`;
}

async function accessToken(key, transport) {
  const response = await transport(key.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: serviceAccountAssertion(key),
    }).toString(),
  });
  // Only the status: the body of a token response is the token itself.
  if (!response.ok) throw new Error(`Google refused the service account (HTTP ${response.status})`);
  const { access_token: token } = await response.json();
  if (!token) throw new Error("Google sent no access token");
  return token;
}

function playClient(token, transport, packageName) {
  return async (method, path, body) => {
    const response = await transport(`${API}/${encodeURIComponent(packageName)}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    if (!response.ok) {
      let message = "";
      try {
        message = JSON.parse(text).error?.message ?? "";
      } catch {
        // Not JSON; say nothing more than the status.
      }
      const error = new Error(`Play API ${method} ${path.replace(/edits\/[^/:]+/, "edits/…")}: HTTP ${response.status}${message ? ` ${message}` : ""}`);
      error.status = response.status;
      error.playMessage = message;
      throw error;
    }
    return text ? JSON.parse(text) : {};
  };
}

/**
 * Sets the notes on the release, commits, and reads them back in a fresh edit.
 * Returns the notes Play now holds for that release.
 */
export async function setPlayReleaseNotes({ key, packageName, versionCode, track = "internal", text }, transport = fetch) {
  const play = playClient(await accessToken(key, transport), transport, packageName);

  const edit = await play("POST", "/edits");
  const current = await play("GET", `/edits/${edit.id}/tracks/${track}`);
  await play("PUT", `/edits/${edit.id}/tracks/${track}`, withReleaseNotes(current, versionCode, text));
  try {
    await play("POST", `/edits/${edit.id}:commit`);
  } catch (error) {
    // Play asks for this flag on an app whose changes go to review in a batch.
    if (!/changesNotSentForReview/i.test(error.playMessage ?? "")) throw error;
    await play("POST", `/edits/${edit.id}:commit?changesNotSentForReview=true`);
  }

  const check = await play("POST", "/edits");
  try {
    return notesOnRelease(await play("GET", `/edits/${check.id}/tracks/${track}`), versionCode);
  } finally {
    await play("DELETE", `/edits/${check.id}`).catch(() => {});
  }
}

async function main() {
  const env = process.env;
  for (const name of ["PLAY_SERVICE_ACCOUNT_KEY_PATH", "PLAY_PACKAGE", "PLAY_VERSION_CODE", "PLAY_VERSION"]) {
    if (!env[name]) throw new Error(`${name} is not set`);
  }
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const text = releaseNotesText(notesForVersion(root, env.PLAY_VERSION));
  const key = JSON.parse(readFileSync(env.PLAY_SERVICE_ACCOUNT_KEY_PATH, "utf8"));
  const track = env.PLAY_TRACK || "internal";

  const stored = await setPlayReleaseNotes({
    key,
    packageName: env.PLAY_PACKAGE,
    versionCode: env.PLAY_VERSION_CODE,
    track,
    text,
  });
  if (stored !== text) {
    throw new Error(`Play does not show the notes on versionCode ${env.PLAY_VERSION_CODE} after the commit`);
  }
  console.log(`Release notes (${NOTES_LANGUAGE}, ${length(text)} characters) are on versionCode ${env.PLAY_VERSION_CODE} in the ${track} track, read back from Play:`);
  console.log(text);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`::error::${error.message}`);
    process.exit(1);
  });
}
