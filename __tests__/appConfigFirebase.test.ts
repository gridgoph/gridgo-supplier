import { resolve } from "node:path";

import { googleServiceInfoFile, googleServicesFile } from "../app.config";

/**
 * How the captain's Firebase config reaches a build.
 *
 * The file is never in this repository, so the rule that finds it is the only
 * thing standing between "push works" and an APK that installs, signs in, and
 * silently never receives anything.
 */

const ROOT = "/repo";
const LOCAL = resolve(ROOT, "google-services.json");

/** Only the listed paths exist. */
const only =
  (...paths: string[]) =>
  (path: string) =>
    paths.includes(path);

describe("googleServicesFile", () => {
  it("uses the path CI names", () => {
    const secret = "/run/secrets/google-services.json";
    expect(googleServicesFile(secret, ROOT, only(secret))).toBe(secret);
  });

  it("resolves a relative named path against the project root", () => {
    const staged = resolve(ROOT, "ci/google-services.json");
    expect(googleServicesFile("ci/google-services.json", ROOT, only(staged))).toBe(staged);
  });

  it("falls back to one dropped in the repo root", () => {
    expect(googleServicesFile(undefined, ROOT, only(LOCAL))).toBe(LOCAL);
    expect(googleServicesFile("", ROOT, only(LOCAL))).toBe(LOCAL);
    expect(googleServicesFile("   ", ROOT, only(LOCAL))).toBe(LOCAL);
  });

  it("omits the key when the machine has never seen the file", () => {
    // `npx expo start`, `tsc`, the suite and `expo config --type public` all
    // have to work without it — the build simply has no Firebase, and
    // store/push.ts reports push unavailable instead of crashing.
    expect(googleServicesFile(undefined, ROOT, () => false)).toBeUndefined();
  });

  it("refuses a named path that does not exist rather than falling back", () => {
    // The failure this guards is the quiet one: CI wires the secret wrongly,
    // the fallback finds nothing, and a green build ships an APK that can
    // never receive an alert.
    expect(() => googleServicesFile("/nope/google-services.json", ROOT, () => false)).toThrow(
      /GOOGLE_SERVICES_JSON/,
    );
  });

  it("refuses a named missing path even when the repo-root copy exists", () => {
    expect(() => googleServicesFile("/nope/google-services.json", ROOT, only(LOCAL))).toThrow(
      /does not exist/,
    );
  });
});

const LOCAL_PLIST = resolve(ROOT, "GoogleService-Info.plist");

describe("googleServiceInfoFile", () => {
  it("uses the file EAS Build staged for the iPhone build", () => {
    const staged = "/home/expo/workingdir/GoogleService-Info.plist";
    expect(googleServiceInfoFile(staged, ROOT, true, only(staged))).toBe(staged);
  });

  it("falls back to one dropped in the repo root", () => {
    expect(googleServiceInfoFile(undefined, ROOT, false, only(LOCAL_PLIST))).toBe(LOCAL_PLIST);
  });

  it("omits the key, so the build leaves Firebase out, when there is no file", () => {
    expect(googleServiceInfoFile(undefined, ROOT, false, () => false)).toBeUndefined();
    expect(googleServiceInfoFile("  ", ROOT, true, () => false)).toBeUndefined();
  });

  it("refuses a named missing file on the EAS build machine", () => {
    expect(() => googleServiceInfoFile("/nope/GoogleService-Info.plist", ROOT, true, () => false)).toThrow(
      /GOOGLE_SERVICE_INFO_PLIST/,
    );
  });

  it("ignores a named file it cannot read where eas-cli starts the build", () => {
    // A secret file variable is not readable on the machine that starts the
    // build; only the build machine gets the file.
    expect(
      googleServiceInfoFile("/nope/GoogleService-Info.plist", ROOT, false, only(LOCAL_PLIST)),
    ).toBeUndefined();
  });
});
