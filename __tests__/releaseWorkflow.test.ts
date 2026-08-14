import { readFileSync } from "fs";
import { join } from "path";

/**
 * The release workflow's two load-bearing properties, asserted here because
 * neither shows up in a build log.
 *
 * `EXPO_PUBLIC_*` values are inlined by Babel while the JS bundle is built, so
 * `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` have to be in
 * the environment of every command that evaluates app config or bundles JS —
 * `expo config`, `expo prebuild`, and gradle. Extra is written at prebuild;
 * a static `process.env` read is what Gradle can still inline if extra was
 * empty. Set only afterwards and the APK falls back to the loopback base in
 * `lib/api.ts` (or ships without the live Clerk key): green in CI, dead on
 * every phone in Davao. `scripts/verify-release-apk.sh` catches it against
 * the built artifact; this catches it against the workflow, before a
 * 20-minute build.
 *
 * And a pull request must never produce a signed release build, so the job
 * that touches the signing key is fenced off from that trigger.
 *
 * Parsed as text rather than YAML: this repo has no YAML parser as a declared
 * dependency, and the questions are about which step a line sits in.
 */

const workflow = readFileSync(
  join(__dirname, "..", ".github", "workflows", "android-release.yml"),
  "utf8",
);

const verifyScript = readFileSync(
  join(__dirname, "..", "scripts", "verify-release-apk.sh"),
  "utf8",
);

/** A job body: every line from its key to the next job's key. */
function jobBody(name: string): string {
  const lines = workflow.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  if (start === -1) throw new Error(`workflow has no job "${name}"`);

  const rest = lines.slice(start + 1);
  const next = rest.findIndex((line) => /^ {2}\S/.test(line));
  return (next === -1 ? rest : rest.slice(0, next)).join("\n");
}

/**
 * A job body split into its steps: blocks opening with `- ` at step indent.
 *
 * Comment lines are dropped first. A comment written above a step belongs to
 * the *previous* step's block, and prose that quotes a command must never be
 * what satisfies an assertion that the command runs.
 */
function steps(body: string): string[] {
  return body
    .split(/^ {6}- /m)
    .slice(1)
    .map((step) =>
      step
        .split("\n")
        .filter((line) => !/^\s*#/.test(line))
        .join("\n"),
    );
}

const apk = jobBody("apk");
const apkSteps = steps(apk);

const publicApiUrlEnv =
  /EXPO_PUBLIC_API_URL:\s*\$\{\{\s*secrets\.EXPO_PUBLIC_API_URL\s*\}\}/;
const clerkPublishableEnv =
  /EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:\s*\$\{\{\s*secrets\.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY\s*\}\}/;

function stepEnv(step: string): string {
  return /\n\s+env:\n([\s\S]*?)\n\s+run:/.exec(step)?.[1] ?? "";
}

function hasReleasePublicEnv(step: string): boolean {
  const env = stepEnv(step);
  return publicApiUrlEnv.test(env) && clerkPublishableEnv.test(env);
}

describe("the release workflow bakes the deployed API URL into the bundle", () => {
  it("finds the step that builds the bundle", () => {
    expect(apkSteps.filter((step) => step.includes("gradlew assembleRelease"))).toHaveLength(1);
  });

  it("sets EXPO_PUBLIC_* on every step that evaluates app config or bundles JS", () => {
    const config = apkSteps.find((step) => step.includes("expo config --type public"));
    const prebuild = apkSteps.find((step) => step.includes("expo prebuild"));
    const build = apkSteps.find((step) => step.includes("gradlew assembleRelease"));

    expect(config).toBeDefined();
    expect(prebuild).toBeDefined();
    expect(build).toBeDefined();
    expect(hasReleasePublicEnv(config as string)).toBe(true);
    expect(hasReleasePublicEnv(prebuild as string)).toBe(true);
    expect(hasReleasePublicEnv(build as string)).toBe(true);
    expect(build).toContain("pk_live_*");
  });

  it("verifies the built APK rather than trusting the build", () => {
    const verify = apkSteps.findIndex((step) =>
      step.includes("scripts/verify-release-apk.sh"),
    );
    const build = apkSteps.findIndex((step) => step.includes("gradlew assembleRelease"));
    const upload = apkSteps.findIndex((step) => step.includes("upload-artifact"));

    expect(verify).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(verify);
  });

  it("destroys every credential however the job ends", () => {
    const cleanup = apkSteps.find((step) => step.includes("rm -f") && step.includes("release.jks"));
    expect(cleanup).toBeDefined();
    expect(cleanup).toMatch(/if:\s*always\(\)/);
    expect(cleanup).toContain("deploy_key");
  });
});

describe("the APK reaches the captain's server only from the default branch", () => {
  const publish = apkSteps.find((step) => step.includes("upload-apk supplier"));

  it("uploads the built APK over the deploy key's forced command", () => {
    expect(publish).toBeDefined();
    // The bytes go on stdin; the forced command reads them server-side.
    expect(publish).toMatch(/'upload-apk supplier' < "\$apk"/);
  });

  it("publishes on a merge to main and on nothing else", () => {
    // A pull request cannot reach this job at all, and a manual dispatch from
    // a branch must not replace what the landing site serves.
    expect(publish).toMatch(
      /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/,
    );
  });

  it("pins the host key rather than trusting whatever answers", () => {
    expect(publish).toContain("StrictHostKeyChecking=yes");
    expect(publish).toContain("UserKnownHostsFile=");
    expect(publish).toMatch(/DEPLOY_KNOWN_HOSTS:\s*\$\{\{\s*secrets\.DEPLOY_KNOWN_HOSTS\s*\}\}/);
  });

  it("publishes only an APK that passed verification", () => {
    const verify = apkSteps.findIndex((step) => step.includes("scripts/verify-release-apk.sh"));
    const published = apkSteps.findIndex((step) => step.includes("upload-apk supplier"));

    expect(published).toBeGreaterThan(verify);
  });
});

describe("the release APK is built with Firebase, or not at all", () => {
  const stage = apkSteps.find((step) => step.includes("GOOGLE_SERVICES_JSON_BASE64"));

  it("stages the captain's config from a secret, never from the repository", () => {
    // The file is gitignored on purpose. If this step ever disappears,
    // app.config.ts finds nothing, omits `googleServicesFile`, and the build
    // stays green while the APK can never receive an alert.
    expect(stage).toBeDefined();
    expect(stage).toMatch(
      /GOOGLE_SERVICES_JSON_BASE64:\s*\$\{\{\s*secrets\.GOOGLE_SERVICES_JSON_BASE64\s*\}\}/,
    );
  });

  it("fails loudly when the secret is missing instead of shipping without push", () => {
    expect(stage).toContain("::error::");
    expect(stage).toMatch(/exit 1/);
  });

  it("checks the file is this app's before spending twenty minutes on a build", () => {
    // One google-services.json covers all three GRIDGO apps; a file without an
    // entry for this package prebuilds happily and receives nothing.
    expect(stage).toContain("ph.gridgo.supplier");
  });

  it("writes it outside the workspace and hands the path to the config", () => {
    expect(stage).toContain('"$RUNNER_TEMP/google-services.json"');
    expect(stage).toMatch(/GOOGLE_SERVICES_JSON=\$RUNNER_TEMP\/google-services\.json/);
  });

  it("stages it before prebuild reads the config", () => {
    const staged = apkSteps.findIndex((step) => step.includes("GOOGLE_SERVICES_JSON_BASE64"));
    const prebuild = apkSteps.findIndex((step) => step.includes("expo prebuild"));
    expect(staged).toBeGreaterThanOrEqual(0);
    expect(prebuild).toBeGreaterThan(staged);
  });

  it("deletes it however the job ends", () => {
    const cleanup = apkSteps.find(
      (step) => step.includes("rm -f") && step.includes("release.jks"),
    );
    expect(cleanup).toContain("google-services.json");
  });
});

describe("the verify script requires baked values, not every env name", () => {
  it("requires the live Clerk publishable value in the bundle", () => {
    expect(verifyScript).toMatch(/require_env EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY/);
    expect(verifyScript).toMatch(/pk_live_\*/);
    expect(verifyScript).toMatch(/grep -aqF -- "\$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"/);
  });

  it("only treats a surviving EXPO_PUBLIC_API_URL identifier as not inlined", () => {
    expect(verifyScript).toMatch(/grep -aqF -- 'EXPO_PUBLIC_API_URL'/);
    expect(verifyScript).not.toMatch(/EXPO_PUBLIC_\[A-Z0-9_\]\*/);
    expect(verifyScript).not.toMatch(/no EXPO_PUBLIC_\* name survives/);
  });

  it("does not fail a bake solely because an error string names the Clerk env", () => {
    const identifierScan = verifyScript.match(/grep[^\n]+EXPO_PUBLIC_[A-Z0-9_[\]*]*/g) ?? [];
    expect(identifierScan.some((line) => line.includes("$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"))).toBe(
      true,
    );
    expect(
      identifierScan.some(
        (line) =>
          line.includes("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY") &&
          !line.includes("$EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY"),
      ),
    ).toBe(false);
  });
});

describe("a pull request never produces a signed release build", () => {
  it("fences the signing job off from the pull_request trigger", () => {
    expect(apk).toMatch(/if:\s*github\.event_name\s*!=\s*'pull_request'/);
  });

  it("keeps every secret inside that job", () => {
    const check = jobBody("check");
    expect(check).not.toMatch(/secrets\./);
  });
});
