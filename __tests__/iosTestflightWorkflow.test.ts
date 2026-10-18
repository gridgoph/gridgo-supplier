import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * The manual iPhone build-and-TestFlight workflow and the eas.json it drives.
 *
 * Neither can run in this repository's CI (the build needs a Mac and Apple
 * credentials), so what matters about them is asserted as text: when the
 * workflow may run, that it builds on GitHub's Mac rather than EAS's, that the
 * build comes before the upload, and that no credential is printed or left
 * behind. Parsed as text for the same reason as releaseWorkflow.test.ts: no
 * YAML parser is a declared dependency. The step that reads the IPA also runs
 * in Bash with stubbed macOS tools to catch shell quoting bugs.
 */

const root = join(__dirname, "..");
const workflow = readFileSync(join(root, ".github", "workflows", "ios-testflight.yml"), "utf8");
const eas = JSON.parse(readFileSync(join(root, "eas.json"), "utf8")) as {
  cli: { version: string; appVersionSource: string };
  build: { production: { environment: string; distribution: string; node: string; ios: { autoIncrement: boolean } } };
  submit: { production: { ios: Record<string, string>; android: Record<string, string> } };
};

/** The `run:` body and `if:` of one named step. */
function step(name: string): string {
  const lines = workflow.split("\n");
  const start = lines.findIndex((line) => line.trim() === `- name: ${name}`);
  if (start === -1) throw new Error(`workflow has no step "${name}"`);
  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => /^ {6}- /.test(line) || /^\S/.test(line));
  return [lines[start], ...rest.slice(0, next === -1 ? undefined : next)].join("\n");
}

describe("ios-testflight.yml", () => {
  it("runs only when started by hand", () => {
    const on = workflow.slice(workflow.indexOf("\non:"), workflow.indexOf("\nconcurrency:"));
    expect(on).toMatch(/workflow_dispatch:/);
    expect(on).not.toMatch(/\bpush:|pull_request|schedule:/);
  });

  it("builds on a GitHub Mac with an Xcode that Expo SDK 57 accepts", () => {
    expect(workflow).toMatch(/runs-on: macos-26\n/);
    const xcode = /XCODE_APP: \/Applications\/Xcode_(\d+)\.(\d+)(?:\.\d+)?\.app/.exec(workflow);
    expect(xcode).not.toBeNull();
    // docs.expo.dev/versions/v57.0.0: SDK 57 needs Xcode 26.4+.
    expect(Number(xcode![1]) * 100 + Number(xcode![2])).toBeGreaterThanOrEqual(2604);
    expect(step("Select Xcode")).toContain('sudo xcode-select --switch "$XCODE_APP/Contents/Developer"');
    expect(workflow.indexOf("- name: Select Xcode")).toBeLessThan(
      workflow.indexOf("- name: Build the iPhone app on this Mac"),
    );
  });

  it("builds locally, so no Expo build allowance is spent, then uploads that IPA", () => {
    const build = step("Build the iPhone app on this Mac");
    const upload = step("Upload to TestFlight");
    expect(build).toMatch(/build --platform ios --profile production\s*\\\n\s*--local --non-interactive --output "\$ipa"/);
    expect(build).not.toMatch(/--wait/);
    expect(upload).toMatch(/if: inputs\.submit_to_testflight/);
    expect(upload).toMatch(/xcrun altool --upload-package "\$IPA" --type ios/);
    expect(upload).toContain('--apple-id "$ASC_APP_ID"');
    expect(upload).toContain('--apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"');
    expect(workflow).not.toMatch(/eas-cli\S*"? submit/);
    expect(workflow.indexOf("- name: Build the iPhone app on this Mac")).toBeLessThan(
      workflow.indexOf("- name: Read the build"),
    );
    expect(workflow.indexOf("- name: Read the build")).toBeLessThan(
      workflow.indexOf("- name: Upload to TestFlight"),
    );
  });

  it("pins the eas-cli that eas.json asks for", () => {
    const pinned = /EAS_CLI: eas-cli@(\S+)/.exec(workflow)?.[1];
    expect(pinned).toBeDefined();
    expect(eas.cli.version).toBe(`>= ${pinned}`);
  });

  it("writes the build outputs and summary from the IPA's Info.plist", () => {
    const temp = mkdtempSync(join(tmpdir(), "gridgo ios build "));
    try {
      const ipa = join(temp, "gridgo supplier.ipa");
      writeFileSync(ipa, Buffer.alloc(3 * 1024 * 1024));
      const run = step("Read the build").split("        run: |\n")[1]
        .split("\n").filter((line) => line.startsWith("          ") || line === "")
        .map((line) => line.slice(10)).join("\n");
      // Stub only the macOS tools; execute the actual workflow shell and Node.
      const stubs = [
        'unzip() { [ "$1" = -p ] && [ "$2" = "$IPA" ] && echo plist; }',
        "plutil() {",
        '  case "$2" in',
        "    CFBundleShortVersionString) echo 1.0.0 ;;",
        "    CFBundleVersion) echo 5 ;;",
        "    CFBundleIdentifier) echo ph.gridgo.supplier ;;",
        "    *) return 1 ;;",
        "  esac",
        "}",
      ].join("\n");
      const result = spawnSync("bash", ["-c", `${stubs}\n${run}`], {
        cwd: temp,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          IPA: ipa,
          RUNNER_TEMP: temp,
          GITHUB_OUTPUT: join(temp, "output"),
          GITHUB_STEP_SUMMARY: join(temp, "summary"),
          GITHUB_SHA: "test-commit-sha",
        },
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(readFileSync(join(temp, "output"), "utf8")).toBe(
        "version=1.0.0\nbuild_number=5\nbundle_id=ph.gridgo.supplier\nannounce_version=1.0.5\n",
      );
      const summary = readFileSync(join(temp, "summary"), "utf8");
      expect(summary).toContain("| Version | `1.0.0` |");
      expect(summary).toContain("| Build number | `5` |");
      expect(summary).toContain("| Bundle | `ph.gridgo.supplier` |");
      expect(summary).toContain("| IPA | 3.0 MB |");
      expect(summary).toContain("| Commit | `test-commit-sha` |");
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("names every credential it needs before spending a build", () => {
    const check = step("Check the secrets");
    for (const name of [
      "EXPO_TOKEN",
      "ASC_API_KEY_P8",
      "ASC_KEY_ID",
      "ASC_ISSUER_ID",
      "EXPO_PUBLIC_API_URL",
      "EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY",
      "EXPO_PUBLIC_CARTO_API_KEY",
      "GOOGLE_SERVICE_INFO_PLIST_BASE64",
    ]) {
      expect(check).toContain(`${name}: \${{ secrets.${name} }}`);
    }
    expect(check).toContain("ASC_APP_ID: ${{ vars.ASC_APP_ID }}");
    expect(check).toMatch(/pk_live_\*/);
  });

  it("keeps the App Store Connect key and the Firebase file in private temp files and removes them", () => {
    const stage = step("Stage the App Store Connect key");
    expect(stage).toMatch(/umask 077/);
    expect(stage).toContain('dir="$RUNNER_TEMP/private_keys"');
    expect(stage).toContain('key="$dir/AuthKey_$ASC_KEY_ID.p8"');
    expect(stage).toContain('echo "API_PRIVATE_KEYS_DIR=$dir" >> "$GITHUB_ENV"');
    const firebase = step("Stage the Firebase file");
    expect(firebase).toMatch(/umask 077/);
    expect(firebase).toContain('plist="$RUNNER_TEMP/GoogleService-Info.plist"');
    expect(firebase).toContain('echo "GOOGLE_SERVICE_INFO_PLIST=$plist" >> "$GITHUB_ENV"');
    expect(firebase).toContain("ph.gridgo.supplier");
    const cleanup = step("Remove the credentials and the IPA");
    expect(cleanup).toMatch(/if: always\(\)/);
    for (const path of ["private_keys", "GoogleService-Info.plist", "gridgo-supplier.ipa"]) {
      expect(cleanup).toContain(`"$RUNNER_TEMP/${path}"`);
    }
  });

  it("never prints a credential", () => {
    expect(workflow).not.toMatch(/echo[^\n]*\$\{?(ASC_API_KEY_P8|EXPO_TOKEN|EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY|EXPO_PUBLIC_CARTO_API_KEY|GOOGLE_SERVICE_INFO_PLIST_BASE64)\b/);
    expect(workflow).not.toMatch(/set -x/);
  });

  it("masks the Firebase file's identifiers before the build can print them", () => {
    const firebase = step("Stage the Firebase file");
    expect(firebase).toContain('echo "::add-mask::$value"');
    expect(firebase).not.toMatch(/cat "\$plist"|echo "\$GOOGLE_SERVICE_INFO_PLIST_BASE64"/);
    expect(workflow.indexOf("- name: Stage the Firebase file")).toBeLessThan(
      workflow.indexOf("- name: Build the iPhone app on this Mac"),
    );
  });
});

describe("eas.json", () => {
  it("raises the iPhone build number on EAS for every build", () => {
    expect(eas.cli.appVersionSource).toBe("remote");
    expect(eas.build.production.ios.autoIncrement).toBe(true);
    expect(eas.build.production.distribution).toBe("store");
    expect(eas.build.production.environment).toBe("production");
  });

  it("builds on the Node major the workflows install, so npm reads the lock the same way", () => {
    // EAS's default Node 22 ships npm 10, which wants an optional peer entry
    // (typescript@5 under @solana/web3.js) that npm 11 never writes into the
    // lock, so `npm ci` failed on EAS while it passed in GitHub Actions.
    const workflowNode = /node-version: (\d+)/.exec(workflow)?.[1];
    expect(workflowNode).toBeDefined();
    expect(eas.build.production.node).toMatch(new RegExp(`^${workflowNode}\\.\\d+\\.\\d+$`));
  });

  it("reads the App Store Connect key from the job's environment", () => {
    expect(eas.submit.production.ios).toMatchObject({
      ascApiKeyPath: "$EXPO_ASC_API_KEY_PATH",
      ascApiKeyIssuerId: "$EXPO_ASC_ISSUER_ID",
      ascApiKeyId: "$EXPO_ASC_KEY_ID",
    });
  });

  it("keeps the Play upload's internal track", () => {
    expect(eas.submit.production.android).toMatchObject({ track: "internal" });
  });
});

it("never commits the iPhone Firebase file", () => {
  const ignored = readFileSync(join(root, ".gitignore"), "utf8").split("\n");
  expect(ignored).toContain("GoogleService-Info.plist");
});

it("announces the TestFlight version only after the upload succeeds, and never fails the run", () => {
  const announce = step("Announce the TestFlight release");
  expect(step("Upload to TestFlight")).toMatch(/id: testflight\n/);
  expect(announce).toMatch(/if: steps\.testflight\.outcome == 'success' && steps\.build\.outputs\.announce_version != ''\n/);
  expect(announce).not.toMatch(/always\(\)|failure\(\)|!cancelled\(\)/);
  expect(announce).toContain("continue-on-error: true");
  expect(announce).toContain("RELEASE_CHANNEL: ios");
  expect(announce).toContain("RELEASE_APP: supplier");
  expect(announce).toContain("RELEASE_VERSION: ${{ steps.build.outputs.announce_version }}");
  expect(announce).toContain("secrets.RELEASE_ANNOUNCE_TOKEN");
  expect(announce).toContain("node scripts/announce-release.mjs");
  expect(workflow.indexOf("- name: Upload to TestFlight")).toBeLessThan(
    workflow.indexOf("- name: Announce the TestFlight release"),
  );
  // Every iPhone build shares app.json's version; the build number tells them apart.
  expect(step("Read the build")).toContain("announce_version=");
});
