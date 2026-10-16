import { readFileSync } from "fs";
import { join } from "path";

/**
 * The release workflow's two load-bearing properties, asserted here because
 * neither shows up in a build log.
 *
 * `EXPO_PUBLIC_*` values are inlined by Babel while the JS bundle is built, so
 * `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, and
 * `EXPO_PUBLIC_CARTO_API_KEY` have to be in the environment of every command
 * that evaluates app config or bundles JS — `expo config`, `expo prebuild`,
 * and gradle. Extra is written at prebuild; a static `process.env` read is
 * what Gradle can still inline if extra was empty. Set only afterwards and
 * the APK falls back to the loopback base in `lib/api.ts` (or ships without
 * the live Clerk key, or dark maps watermark): green in CI, dead on every
 * phone in Davao. `scripts/verify-release-apk.sh` catches it against the
 * built artifact; this catches it against the workflow, before a 20-minute
 * build.
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
const cartoApiKeyEnv =
  /EXPO_PUBLIC_CARTO_API_KEY:\s*\$\{\{\s*secrets\.EXPO_PUBLIC_CARTO_API_KEY\s*\}\}/;

function stepEnv(step: string): string {
  return /\n\s+env:\n([\s\S]*?)\n\s+run:/.exec(step)?.[1] ?? "";
}

function hasReleasePublicEnv(step: string): boolean {
  const env = stepEnv(step);
  return publicApiUrlEnv.test(env) && clerkPublishableEnv.test(env) && cartoApiKeyEnv.test(env);
}

describe("the release workflow bakes the deployed API URL into the bundle", () => {
  it("finds the step that builds the bundle", () => {
    expect(apkSteps.filter((step) => step.includes("gradlew assembleRelease"))).toHaveLength(1);
  });

  it("sets EXPO_PUBLIC_* on every step that evaluates app config or bundles JS", () => {
    const config = apkSteps.find((step) => step.includes("expo config --type public"));
    const prebuild = apkSteps.find((step) => step.includes("expo prebuild"));
    const build = apkSteps.find((step) => step.includes("gradlew assembleRelease"));
    const verify = apkSteps.find((step) => step.includes("scripts/verify-release-apk.sh"));

    expect(config).toBeDefined();
    expect(prebuild).toBeDefined();
    expect(build).toBeDefined();
    expect(verify).toBeDefined();
    expect(hasReleasePublicEnv(config as string)).toBe(true);
    expect(hasReleasePublicEnv(prebuild as string)).toBe(true);
    expect(hasReleasePublicEnv(build as string)).toBe(true);
    expect(hasReleasePublicEnv(verify as string)).toBe(true);
    expect(build).toContain("pk_live_*");
    expect(build).toContain("EXPO_PUBLIC_CARTO_API_KEY is not set for the build step");
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

  it("lets artifact storage quota fail without failing the signed job", () => {
    const upload = apkSteps.find((step) => step.includes("upload-artifact"));
    expect(upload).toMatch(/continue-on-error:\s*true/);
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

  it("publishes to the captain's server before the run artifact", () => {
    const published = apkSteps.findIndex((step) => step.includes("upload-apk supplier"));
    const release = apkSteps.findIndex((step) => step.includes("gh release create"));
    const upload = apkSteps.findIndex((step) => step.includes("upload-artifact"));

    expect(published).toBeGreaterThanOrEqual(0);
    expect(release).toBeGreaterThanOrEqual(0);
    expect(upload).toBeGreaterThan(published);
    expect(upload).toBeGreaterThan(release);
  });

  it("names the Release only after the landing site serves the same APK", () => {
    // The update prompt reads GitHub's latest Release; "Update now" downloads
    // from the landing site. A Release first offers N while the site serves
    // N-1, and a failed upload must stop the Release (default `success()`).
    const published = apkSteps.findIndex((step) => step.includes("upload-apk supplier"));
    const release = apkSteps.findIndex((step) => step.includes("gh release create"));

    expect(release).toBeGreaterThan(published);
    expect(apkSteps[release]).not.toMatch(/always\(\)|continue-on-error/);
  });

  it("never marks a Release latest when the landing site was not updated", () => {
    const release = apkSteps.find((step) => step.includes("gh release create"));

    expect(release).toContain('"$GITHUB_EVENT_NAME" != "push"');
    expect(release).toContain('"$GITHUB_REF" != "refs/heads/main"');
    expect(release).toContain("latest=(--latest=false)");
    expect(release).toContain('"${latest[@]}"');
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

  it("requires the CARTO tile host and key in the bundle without printing the key", () => {
    expect(verifyScript).toMatch(/require_env EXPO_PUBLIC_CARTO_API_KEY/);
    expect(verifyScript).toMatch(/basemaps\.cartocdn\.com/);
    expect(verifyScript).toMatch(/grep -aqF -- "\$EXPO_PUBLIC_CARTO_API_KEY"/);
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

describe("the release carries its What's new notes", () => {
  it("checks the notes on every pull request", () => {
    expect(jobBody("check")).toContain("node scripts/whats-new.js check");
  });

  it("writes the pending notes and their label into the release the app reads", () => {
    const release = apkSteps.find((step) => step.includes("gh release create"));
    expect(release).toContain("node scripts/whats-new.js notes");
    expect(release).toContain('--notes "$notes"');
  });

  it("files those notes under the version only after the latest release is out", () => {
    const record = apkSteps.findIndex((step) => step.includes("scripts/whats-new.js record"));
    const githubRelease = apkSteps.findIndex((step) => step.includes("gh release create"));
    expect(record).toBeGreaterThan(githubRelease);
    const step = apkSteps[record];
    // A manual dispatch publishes a not-latest release; its notes stay pending.
    expect(step).toMatch(/if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/);
    expect(step).not.toMatch(/always\(\)|failure\(\)|!cancelled\(\)/);
    expect(step).toContain("git push origin HEAD:main");
  });

  it("can push that record with the job's own token", () => {
    expect(apk).toMatch(/permissions:\s*\n\s+contents:\s*write/);
  });
});


describe("release push follows both successful publishes", () => {
  it("announces the released version only on a push to main", () => {
    const index = apkSteps.findIndex(step => step.includes("scripts/announce-release.mjs"));
    expect(index).toBeGreaterThan(apkSteps.findIndex(step => step.includes("gh release create")));
    const step = apkSteps[index];
    expect(step).toMatch(/if: github.event_name == 'push' && github.ref == 'refs\/heads\/main'/);
    expect(step).not.toMatch(/always\(\)|failure\(\)|!cancelled\(\)/);
    expect(step).toContain("continue-on-error: true");
    expect(step).toContain("secrets.RELEASE_ANNOUNCE_TOKEN");
    expect(step).toContain("steps.config.outputs.version");
    expect(step).toContain("RELEASE_APP: supplier");
  });
});

describe("a manual play_bundle run builds a Google Play bundle and publishes nothing", () => {
  const isPlay = /if:\s*github\.event\.inputs\.play_bundle == 'true'/;
  const notPlay = /if:\s*github\.event\.inputs\.play_bundle != 'true'/;
  const pushToMain = /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'/;
  const bundleStep = () => apkSteps.find((step) => step.includes("gradlew bundleRelease"));
  const aabVerify = () =>
    apkSteps.find((step) => step.includes("scripts/verify-release-apk.sh") && step.includes(".aab"));
  const aabUpload = () =>
    apkSteps.find((step) => step.includes("upload-artifact") && step.includes("*.aab"));

  it("is a manual dispatch input that defaults off", () => {
    expect(workflow).toMatch(/ {6}play_bundle:\n[\s\S]*?type: boolean\n\s+default: false/);
  });

  it("builds the AAB with the APK's public configuration and the Play distribution flag", () => {
    const build = bundleStep();
    expect(build).toBeDefined();
    expect(build).toMatch(isPlay);
    expect(hasReleasePublicEnv(build as string)).toBe(true);
    expect(stepEnv(build as string)).toMatch(/EXPO_PUBLIC_APP_DISTRIBUTION:\s*play$/m);
    expect(build).toContain("pk_live_*");
    expect(build).toContain("./gradlew bundleRelease --no-daemon --max-workers=2");
  });

  it("sets the Play flag on that step alone, so the APK keeps its update prompt", () => {
    const flagged = apkSteps.filter((step) => step.includes("EXPO_PUBLIC_APP_DISTRIBUTION"));
    expect(flagged).toEqual([bundleStep()]);
    expect(workflow.split("\njobs:")[0]).not.toContain("EXPO_PUBLIC_APP_DISTRIBUTION");
    expect(apk.split(/\n {4}steps:/)[0]).not.toContain("EXPO_PUBLIC_APP_DISTRIBUTION");
  });

  it("skips every APK build step on a Play run and nothing else of the APK path changes", () => {
    for (const marker of [
      "gradlew assembleRelease",
      "apk/release/app-release.apk",
      "cp android/app/build/outputs/apk/release/app-release.apk",
    ]) {
      const step = apkSteps.find((s) => s.includes(marker));
      expect(step).toMatch(notPlay);
    }
    const apkUpload = apkSteps.find((step) => step.includes("upload-artifact") && step.includes("*.apk"));
    expect(apkUpload).toMatch(notPlay);
    expect(apkUpload).toMatch(/continue-on-error:\s*true/);
  });

  it("verifies the AAB's signer and bundle before uploading it", () => {
    const verify = aabVerify();
    expect(verify).toMatch(isPlay);
    expect(hasReleasePublicEnv(verify as string)).toBe(true);
    expect(verify).toContain("android/app/build/outputs/bundle/release/app-release.aab");
    expect(verify).toMatch(/ANDROID_KEY_ALIAS:\s*\$\{\{\s*secrets\.ANDROID_KEY_ALIAS\s*\}\}/);

    const build = apkSteps.indexOf(bundleStep() as string);
    const verified = apkSteps.indexOf(verify as string);
    const upload = apkSteps.indexOf(aabUpload() as string);
    expect(verified).toBeGreaterThan(build);
    expect(upload).toBeGreaterThan(verified);
  });

  it("uploads the AAB as an Actions artifact, and a failed upload fails the run", () => {
    const upload = aabUpload();
    expect(upload).toMatch(isPlay);
    expect(upload).not.toMatch(/continue-on-error/);
    expect(upload).toContain("if-no-files-found: error");
  });

  it("never reaches the landing site, a GitHub Release, the release push or What's new", () => {
    // A push event carries no inputs, so these push-only steps cannot run on a dispatch.
    for (const marker of ["upload-apk supplier", "scripts/announce-release.mjs", "scripts/whats-new.js record"]) {
      expect(apkSteps.find((step) => step.includes(marker))).toMatch(pushToMain);
    }
    const release = apkSteps.find((step) => step.includes("gh release create"));
    expect(release).toMatch(/&& github\.event\.inputs\.play_bundle != 'true'/);
  });

  it("runs in its own concurrency group, so it never cancels a main release", () => {
    expect(workflow).toMatch(
      /group: android-apk-\$\{\{ github\.ref \}\}\$\{\{ github\.event\.inputs\.play_bundle == 'true' && '-play' \|\| '' \}\}/,
    );
  });

  it("keeps the signing key cleanup for the Play run too", () => {
    const cleanup = apkSteps.find((step) => step.includes("rm -f") && step.includes("release.jks"));
    expect(cleanup).toMatch(/if:\s*always\(\)/);
  });
});

describe("submit_to_play hands the verified AAB to EAS Submit for the internal track only", () => {
  const eas = JSON.parse(readFileSync(join(__dirname, "..", "eas.json"), "utf8"));
  const appJson = JSON.parse(readFileSync(join(__dirname, "..", "app.json"), "utf8"));
  const submitStep = () => apkSteps.find((step) => step.includes("eas-cli@"));

  it("is a manual dispatch input that defaults off", () => {
    expect(workflow).toMatch(/ {6}submit_to_play:\n[\s\S]*?type: boolean\n\s+default: false/);
  });

  it("runs only on a Play bundle run that asked for it", () => {
    expect(submitStep()).toMatch(
      /if: github\.event\.inputs\.play_bundle == 'true' && github\.event\.inputs\.submit_to_play == 'true'\n/,
    );
    // Nothing else in the job reads the new input, so the APK path cannot change.
    const readers = apkSteps.filter((step) => /inputs\.submit_to_play/.test(step));
    const named = apkSteps.find((step) => step.includes("Name the Play bundle"));
    expect(readers).toEqual([named, submitStep()]);
  });

  it("submits the AAB after it is verified and kept as an artifact", () => {
    const verified = apkSteps.findIndex(
      (step) => step.includes("scripts/verify-release-apk.sh") && step.includes(".aab"),
    );
    const kept = apkSteps.findIndex((step) => step.includes("upload-artifact") && step.includes("*.aab"));
    const submitted = apkSteps.indexOf(submitStep() as string);
    expect(submitted).toBeGreaterThan(verified);
    expect(submitted).toBeGreaterThan(kept);
  });

  it("pins eas-cli and runs it non-interactive against that AAB", () => {
    const step = submitStep() as string;
    expect(step).toMatch(/npx --yes eas-cli@\d+\.\d+\.\d+ submit/);
    expect(step).toContain("--platform android");
    expect(step).toContain("--profile production");
    expect(step).toContain('--path "$RUNNER_TEMP/play/$AAB"');
    expect(step).toContain("--non-interactive");
    expect(step).toMatch(/EXPO_TOKEN:\s*\$\{\{\s*secrets\.EXPO_TOKEN\s*\}\}/);
  });

  it("keeps the service-account key outside the workspace, private, and never echoed", () => {
    const step = submitStep() as string;
    expect(step).toMatch(
      /GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:\s*\$\{\{\s*secrets\.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON\s*\}\}/,
    );
    expect(step).toContain('key="$RUNNER_TEMP/play-service-account.json"');
    expect(step).toContain("umask 077");
    expect(step).toContain('chmod 600 "$key"');
    expect(step).toContain(`trap 'rm -f "$key"' EXIT`);
    // The one expansion of the secret writes it to the key file.
    const expansions = step.split("\n").filter((line) => line.includes("$GOOGLE_PLAY_SERVICE_ACCOUNT_JSON"));
    expect(expansions.map((line) => line.trim())).toEqual([
      `printf '%s' "$GOOGLE_PLAY_SERVICE_ACCOUNT_JSON" > "$key"`,
    ]);
    expect(step).not.toMatch(/--verbose|set -x/);

    const cleanup = apkSteps.find((step) => step.includes("rm -f") && step.includes("release.jks"));
    expect(cleanup).toContain("play-service-account.json");
  });

  it("sets the version's What's new on that release after the submit", () => {
    const step = submitStep() as string;
    const submit = step.indexOf("eas-cli@");
    const notes = step.indexOf("node scripts/play-release-notes.mjs");
    expect(notes).toBeGreaterThan(submit);
    expect(step).toContain('PLAY_SERVICE_ACCOUNT_KEY_PATH="$key"');
    expect(step).toContain('PLAY_VERSION_CODE="$CODE"');
    expect(step).toContain('PLAY_VERSION="$VERSION"');
    expect(step).toContain('PLAY_PACKAGE="$PACKAGE"');
    expect(jobBody("check")).toContain("node --test scripts/play-release-notes.test.mjs");
  });

  it("submits to internal testing only and never promotes", () => {
    expect(eas.submit.production.android).toEqual({
      serviceAccountKeyPath: "$GOOGLE_PLAY_SERVICE_ACCOUNT_KEY_PATH",
      track: "internal",
      releaseStatus: "completed",
    });
    expect(Object.keys(eas.submit)).toEqual(["production"]);
    // Android builds stay in this workflow with the upload key, never on EAS.
    expect(eas.build?.production?.android).toBeUndefined();
  });

  it("links this app to its EAS project", () => {
    expect(appJson.expo.owner).toBe("felyciaaa");
    expect(appJson.expo.extra.eas.projectId).toBe("ebba1b98-6125-4c84-ac04-3ef268ce9bd2");
  });
});
