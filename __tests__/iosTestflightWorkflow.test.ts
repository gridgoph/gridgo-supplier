import { spawnSync } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

/**
 * The manual iPhone build-and-TestFlight workflow and the eas.json it drives.
 *
 * Neither can run in this repository's CI (the build needs Apple credentials
 * and EAS minutes), so what matters about them is asserted as text: when the
 * workflow may run, that the build comes before the upload, and that no
 * credential is printed or left behind. Parsed as text for the same reason as
 * releaseWorkflow.test.ts: no YAML parser is a declared dependency. The build
 * step also runs in Bash with fixture EAS output to catch shell quoting bugs.
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

  it("builds the iPhone app on EAS, then uploads that build to TestFlight", () => {
    const build = step("Build the iPhone app on EAS");
    const upload = step("Upload to TestFlight");
    expect(build).toMatch(/build --platform ios --profile production/);
    expect(build).toMatch(/--non-interactive --wait/);
    expect(upload).toMatch(/submit --platform ios --profile production/);
    expect(upload).toMatch(/--id "\$BUILD_ID"/);
    expect(upload).toMatch(/if: inputs\.submit_to_testflight/);
    expect(workflow.indexOf("- name: Build the iPhone app on EAS")).toBeLessThan(
      workflow.indexOf("- name: Upload to TestFlight"),
    );
  });

  it("announces the TestFlight version only after the upload succeeds, and never fails the run", () => {
    const announce = step("Announce the TestFlight release");
    expect(step("Upload to TestFlight")).toMatch(/id: testflight\n/);
    expect(step("Build the iPhone app on EAS")).toContain("`${line[1]}.${line[2]}.${number}`");
    expect(step("Build the iPhone app on EAS")).toContain("version=${version}");
    expect(announce).toMatch(/if: steps\.testflight\.outcome == 'success'\n/);
    expect(announce).toContain("continue-on-error: true");
    expect(announce).toContain("RELEASE_CHANNEL: ios");
    expect(announce).toContain("RELEASE_APP: supplier");
    expect(announce).toContain("RELEASE_VERSION: ${{ steps.build.outputs.version }}");
    expect(announce).toContain("secrets.RELEASE_ANNOUNCE_TOKEN");
    expect(announce).toContain("node scripts/announce-release.mjs");
    expect(workflow.indexOf("- name: Upload to TestFlight")).toBeLessThan(
      workflow.indexOf("- name: Announce the TestFlight release"),
    );
  });

  it("pins the eas-cli that eas.json asks for", () => {
    const pinned = /EAS_CLI: eas-cli@(\S+)/.exec(workflow)?.[1];
    expect(pinned).toBeDefined();
    expect(eas.cli.version).toBe(`>= ${pinned}`);
  });

  it.each(["array", "object"])("writes the build outputs and summary from EAS %s JSON", (shape) => {
    const temp = mkdtempSync(join(tmpdir(), "gridgo ios build "));
    try {
      const build = { id: "test-build-id", appVersion: "1.0.0", appBuildVersion: "5", status: "FINISHED" };
      const fixture = join(temp, "eas.json");
      writeFileSync(fixture, JSON.stringify(shape === "array" ? [build] : build));
      const run = step("Build the iPhone app on EAS").split("        run: |\n")[1]
        .split("\n").filter((line) => line.startsWith("          "))
        .map((line) => line.slice(10)).join("\n");
      // Stub only the remote build; execute the actual workflow shell and Node.
      const result = spawnSync("bash", ["-c", 'npx() { cat "$EAS_BUILD_FIXTURE"; }\n' + run], {
        cwd: temp,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          EAS_CLI: "eas-cli-test",
          EAS_BUILD_FIXTURE: fixture,
          RUNNER_TEMP: temp,
          GITHUB_OUTPUT: join(temp, "output"),
          GITHUB_STEP_SUMMARY: join(temp, "summary"),
          GITHUB_SHA: "test-commit-sha",
        },
      });
      expect(result.stderr).toBe("");
      expect(result.status).toBe(0);
      expect(readFileSync(join(temp, "output"), "utf8")).toBe("id=test-build-id\nversion=1.0.5\n");
      const summary = readFileSync(join(temp, "summary"), "utf8");
      expect(summary).toContain("| Version | `1.0.0` |");
      expect(summary).toContain("| Build number | `5` |");
      expect(summary).toContain("| Status | FINISHED |");
      expect(summary).toContain("https://expo.dev/accounts/felyciaaa/projects/gridgo-supplier/builds/test-build-id");
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
    ]) {
      expect(check).toContain(`${name}: \${{ secrets.${name} }}`);
    }
    expect(check).toContain("ASC_APP_ID: ${{ vars.ASC_APP_ID }}");
    expect(check).toMatch(/pk_live_\*/);
  });

  it("keeps the App Store Connect key in a private temp file and removes it", () => {
    const stage = step("Stage the App Store Connect key");
    expect(stage).toMatch(/umask 077/);
    expect(stage).toMatch(/\$RUNNER_TEMP\/asc_api_key\.p8/);
    const cleanup = step("Remove the App Store Connect key");
    expect(cleanup).toMatch(/if: always\(\)/);
    expect(cleanup).toMatch(/rm -f "\$RUNNER_TEMP\/asc_api_key\.p8"/);
  });

  it("never prints a credential", () => {
    expect(workflow).not.toMatch(/echo[^\n]*\$\{?(ASC_API_KEY_P8|EXPO_TOKEN|EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY|EXPO_PUBLIC_CARTO_API_KEY)\b/);
    expect(workflow).not.toMatch(/set -x/);
  });

  it("never handles the Firebase file itself", () => {
    // GOOGLE_SERVICE_INFO_PLIST is an EAS file variable; GitHub never holds it.
    expect(workflow).not.toMatch(/secrets\.GOOGLE_SERVICE/);
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
