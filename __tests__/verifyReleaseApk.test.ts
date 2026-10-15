import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

/**
 * `scripts/verify-release-apk.sh` against fake signing tools, for both the
 * side-load APK and the Google Play bundle. Nothing here touches a real
 * keystore: `apksigner`, `jarsigner`, `keytool` and `unzip` are stand-ins that
 * print what the real tools would.
 */

const verifyScript = join(__dirname, "..", "scripts", "verify-release-apk.sh");

function executable(path: string, body: string) {
  writeFileSync(path, `#!/usr/bin/env bash\nset -euo pipefail\n${body}\n`);
  chmodSync(path, 0o755);
}

const goodBundle =
  "https://api.fixture.invalid pk_live_fixture_value https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=fixture-carto-key";

describe("release build verification", () => {
  let fixtureRoot: string;

  beforeEach(() => {
    fixtureRoot = mkdtempSync(join(tmpdir(), "gridgo-supplier-apk-"));
    const bin = join(fixtureRoot, "bin");
    mkdirSync(bin);

    executable(
      join(bin, "apksigner"),
      `if [[ "$*" == *"--print-certs"* ]]; then
  echo "Signer #1 certificate SHA-256 digest: aa"
fi`,
    );
    // The verifier pipes the store password into keytool under pipefail; a
    // fake that exits without reading lets printf die of SIGPIPE. Drain stdin
    // like the real tool does.
    executable(join(bin, "keytool"), `cat >/dev/null\necho "SHA256: AA"`);
    executable(join(bin, "unzip"), `printf '%s' "\${FAKE_BUNDLE_CONTENT:-}"`);
    executable(join(bin, "jarsigner"), `echo "\${FAKE_JARSIGNER_OUT:-jar verified.}"`);
    writeFileSync(join(fixtureRoot, "fake.apk"), "fixture");
    writeFileSync(join(fixtureRoot, "fake.aab"), "fixture");
    writeFileSync(join(fixtureRoot, "release.jks"), "fixture");
  });

  afterEach(() => {
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  function verify(artifact: string, extra: Record<string, string> = {}) {
    return spawnSync("bash", [verifyScript, join(fixtureRoot, artifact)], {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${join(fixtureRoot, "bin")}${delimiter}${process.env.PATH ?? ""}`,
        ANDROID_HOME: join(fixtureRoot, "missing-android-sdk"),
        ANDROID_SDK_ROOT: join(fixtureRoot, "missing-android-sdk"),
        ANDROID_KEYSTORE_PATH: join(fixtureRoot, "release.jks"),
        ANDROID_KEYSTORE_PASSWORD: "fixture-password",
        ANDROID_KEY_ALIAS: "fixture-alias",
        EXPO_PUBLIC_API_URL: "https://api.fixture.invalid",
        EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_fixture_value",
        EXPO_PUBLIC_CARTO_API_KEY: "fixture-carto-key",
        FAKE_BUNDLE_CONTENT: goodBundle,
        ...extra,
      },
    });
  }

  it("passes a side-load APK signed by the keystore alias", () => {
    const result = verify("fake.apk");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK: signed by alias 'fixture-alias'");
    expect(result.stdout).toContain("inlined in assets/index.android.bundle");
    expect(result.stdout).toContain("OK: fake.apk is a real signed release build");
  });

  it("passes a Play bundle signed by the keystore alias", () => {
    const result = verify("fake.aab");
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("OK: signed by alias 'fixture-alias'");
    expect(result.stdout).toContain("base/assets/index.android.bundle");
    expect(result.stdout).toContain("OK: fake.aab is a real signed release build");
  });

  it("fails an unsigned Play bundle, which jarsigner does not treat as an error", () => {
    const result = verify("fake.aab", { FAKE_JARSIGNER_OUT: "jar is unsigned." });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("the AAB is not signed");
  });

  it("fails a Play bundle signed by another key", () => {
    const bin = join(fixtureRoot, "bin");
    executable(
      join(bin, "keytool"),
      `cat >/dev/null
if [[ "$*" == *"-jarfile"* ]]; then echo "SHA256: BB"; else echo "SHA256: AA"; fi`,
    );
    const result = verify("fake.aab");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("AAB is signed by a different certificate than alias 'fixture-alias'");
  });

  it("fails when the distribution flag was read at runtime instead of inlined", () => {
    const result = verify("fake.apk", {
      FAKE_BUNDLE_CONTENT: `${goodBundle} process.env.EXPO_PUBLIC_APP_DISTRIBUTION`,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("EXPO_PUBLIC_APP_DISTRIBUTION survives");
  });

  it("never prints the keystore password", () => {
    for (const artifact of ["fake.apk", "fake.aab"]) {
      const result = verify(artifact);
      expect(`${result.stdout}${result.stderr}`).not.toContain("fixture-password");
    }
  });
});
