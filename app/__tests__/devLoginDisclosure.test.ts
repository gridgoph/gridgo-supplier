import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";

import { DEV_LOGIN } from "@/lib/devLogin";

const ROOT = resolve(__dirname, "../..");
const GUARDED_MODULE = resolve(ROOT, "lib/devLogin.ts");

/** Official Clerk supplier used by the __DEV__ prefill. */
const OFFICIAL_DEV_EMAIL = "markdavidprado@gmail.com";
/** Retired demo domains. No `g` flag: reused with `.test()`. */
const RETIRED_ACCOUNT_ADDRESS = /[A-Za-z0-9._%+-]+@gridgo\.(?:ph|local)\b/;
/** The local fixture password from gridgo-api demo-fixtures. */
const DEMO_PASSWORD = "Ilovegridgo-0990";

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === "node_modules" || entry === "__tests__" || entry === "dist") return [];
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

/**
 * The captain signs in dozens of times a day. The credentials that make that
 * one tap live only behind `__DEV__`, so a release build cannot contain them.
 *
 * `scripts/assert-no-dev-credentials.mjs` proves the emitted export, but it can
 * only run after a production bundle. These assertions run on every `npm test`,
 * so a reintroduction is caught at review time and the export assertion is the
 * backstop rather than the first line of defence.
 */
describe("dev login credential disclosure", () => {
  it("keeps every demo address and the fixture password in the guarded module", () => {
    const offenders = sourceFiles(ROOT)
      .filter((file) => file !== GUARDED_MODULE)
      .filter((file) => {
        // Scripts that *assert* absence must name the strings they hunt for.
        if (file.startsWith(join(ROOT, "scripts"))) return false;
        const source = readFileSync(file, "utf8");
        return (
          RETIRED_ACCOUNT_ADDRESS.test(source) ||
          source.includes(OFFICIAL_DEV_EMAIL) ||
          source.includes(DEMO_PASSWORD)
        );
      })
      .map((file) => relative(ROOT, file));

    expect(offenders).toEqual([]);
  });

  it("drops the guarded module's credentials via a build-time __DEV__ branch", () => {
    const source = readFileSync(GUARDED_MODULE, "utf8");

    // Metro substitutes __DEV__, folding the false branch to a constant null.
    // A runtime flag would still ship the literals inside the bundle.
    expect(source).toContain("__DEV__");
    expect(source).toMatch(/__DEV__\s*\?\s*\{/);
    expect(source).toMatch(/:\s*null/);
    // Inline in the true branch — not a hoisted module constant outside it.
    expect(source).toContain(OFFICIAL_DEV_EMAIL);
    expect(source).toContain(DEMO_PASSWORD);
  });

  it("uses the official Clerk supplier", () => {
    // Jest is a development runtime, so the true branch is live.
    expect(DEV_LOGIN).not.toBeNull();
    expect(DEV_LOGIN!.email).toBe(OFFICIAL_DEV_EMAIL);
    expect(DEV_LOGIN!.password).toBe(DEMO_PASSWORD);
  });

  it(
    "strips the demo address and password from a production export",
    () => {
      const outDir = mkdtempSync(join(tmpdir(), "gridgo-supplier-prod-"));
      // Platform-agnostic JS bundle. Hermes bytecode would need disassembly;
      // the web export is readable text and still goes through Metro's __DEV__
      // substitution, which is the property under test.
      execFileSync(
        "npx",
        ["expo", "export", "--platform", "web", "--output-dir", outDir, "--clear"],
        {
          cwd: ROOT,
          env: {
            ...process.env,
            NODE_ENV: "production",
            CI: "1",
            EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY:
              "pk_live_Z3JpZGdvLmV4YW1wbGUuY29tJA",
          },
          stdio: ["ignore", "pipe", "pipe"],
          // `--clear` forces a cold Metro rebuild. A measured web export on
          // this machine is ~199s, so 180s timed the spawn out after the
          // bundle had already done the work.
          timeout: 300_000,
        },
      );

      expect(existsSync(outDir)).toBe(true);

      // Run the same assertion the script uses, against this export.
      execFileSync("node", [join(ROOT, "scripts/assert-no-dev-credentials.mjs"), "--dir", outDir], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "pipe"],
      });
    },
    360_000,
  );
});
