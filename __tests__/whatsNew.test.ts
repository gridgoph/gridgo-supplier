import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { parseWhatsNew, WHATS_NEW_LIMITS } from "@/lib/appUpdate";

// Plain Node, so CI runs it without a build step; see the file's header.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const whatsNew = require("../scripts/whats-new.js") as {
  HISTORY_MARKER: string;
  MAX_CHARS: number;
  noteProblem: (lines: string[]) => string | null;
  pendingNotes: (root: string) => { file: string; kind: string; text: string }[];
  recordRelease: (root: string, version: string) => number;
  recordedReleases: (history: string) => { version: string; kind: string; notes: string[] }[];
  releaseHistory: (root: string, version?: string) => { version: string; kind: string; notes: string[] }[];
  releaseKind: (notes: { kind?: string }[]) => string;
  releaseSection: (notes: { text: string; kind?: string }[]) => string;
};

const repo = join(__dirname, "..");
let root: string;

function note(name: string, body: string) {
  writeFileSync(join(root, "whats-new", name), body);
}

// A fixture of its own, never a copy of the repository's files: CI files every
// real release into WHATS_NEW.md, so a copy would carry that history into the
// assertions below.
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "whats-new-"));
  mkdirSync(join(root, "whats-new"));
  writeFileSync(join(root, "WHATS_NEW.md"), `# What's new\n\n${whatsNew.HISTORY_MARKER}\n`);
  writeFileSync(join(root, "whats-new", "README.md"), "# Pending notes\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the notes waiting in this repository", () => {
  it("are all well formed, so the release step cannot fail on one", () => {
    expect(() => whatsNew.pendingNotes(repo)).not.toThrow();
  });

  it("fit the app's own limit, so a phone shows them whole", () => {
    expect(whatsNew.MAX_CHARS).toBe(WHATS_NEW_LIMITS.maxChars);
  });

  it("keep the marker CI files each release under", () => {
    expect(readFileSync(join(repo, "WHATS_NEW.md"), "utf8")).toContain(whatsNew.HISTORY_MARKER);
  });
});

describe("a pending note", () => {
  it("is one plain bullet", () => {
    expect(whatsNew.noteProblem(["- Faster checkout"])).toBeNull();
    expect(whatsNew.noteProblem([])).toMatch(/one line/);
    expect(whatsNew.noteProblem(["- One", "- Two"])).toMatch(/one line/);
    expect(whatsNew.noteProblem(["Faster checkout"])).toMatch(/bullet/);
    expect(whatsNew.noteProblem(["- " + "x".repeat(121)])).toMatch(/121 characters/);
    expect(whatsNew.noteProblem(["- See https://example.com"])).toMatch(/plain words/);
    expect(whatsNew.noteProblem(["- Fixed `parseWhatsNew`"])).toMatch(/plain words/);
    expect(whatsNew.noteProblem(["- [Docs](docs/x.md)"])).toMatch(/plain words/);
  });

  it("may say what kind of change it is on a first line", () => {
    expect(whatsNew.noteProblem(["Kind: fix", "- Mended"])).toBeNull();
    expect(whatsNew.noteProblem(["kind: Feature", "- Added"])).toBeNull();
    expect(whatsNew.noteProblem(["Kind: major", "- Added"])).toMatch(/feature, improvement/);
    expect(whatsNew.noteProblem(["Kind: fix"])).toMatch(/one line/);
  });

  it("reads its kind, and counts as an improvement without one", () => {
    note("1-a.md", "Kind: fix\n- Mended\n");
    note("2-b.md", "- Plain\n");
    expect(whatsNew.pendingNotes(root).map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "fix", text: "Mended" },
      { kind: "improvement", text: "Plain" },
    ]);
  });

  it("names its own file when it is not", () => {
    note("200-bad.md", "Faster checkout\n");
    expect(() => whatsNew.pendingNotes(root)).toThrow("whats-new/200-bad.md must be one bullet");
  });
});

describe("the release body", () => {
  it("lists pending notes by pull request number, and the app reads them back", () => {
    note("9-first.md", "- First\n");
    note("108-second.md", "- Second\n");
    note("1000-third.md", "- Third\n");
    const section = whatsNew.releaseSection(whatsNew.pendingNotes(root));
    expect(section).toBe(
      "## What's new\n\nRelease type: Improvement\n\n- First\n- Second\n- Third\n",
    );
    const body = `${section}\n## Build\n\nSigned release APK for sideloading (123M).\n`;
    expect(parseWhatsNew(body)).toEqual(["First", "Second", "Third"]);
  });

  it("is labelled by the biggest kind of change it carries", () => {
    expect(whatsNew.releaseKind([{ kind: "fix" }, { kind: "fix" }])).toBe("fix");
    expect(whatsNew.releaseKind([{ kind: "fix" }, { kind: "improvement" }])).toBe("improvement");
    expect(whatsNew.releaseKind([{ kind: "fix" }, { kind: "feature" }, { kind: "improvement" }])).toBe(
      "feature",
    );
    note("1-a.md", "Kind: fix\n- Mended\n");
    note("2-b.md", "Kind: feature\n- Added\n");
    expect(whatsNew.releaseSection(whatsNew.pendingNotes(root))).toContain("Release type: New feature\n");
  });

  it("has no section when nothing is pending, and the app falls back", () => {
    expect(whatsNew.releaseSection(whatsNew.pendingNotes(root))).toBe("");
    expect(parseWhatsNew("## Build\n\nSigned release APK for sideloading (123M).")).toEqual([]);
  });
});

describe("recording a release", () => {
  it("files the notes under the version and its label, newest release first, and clears them", () => {
    note("108-a.md", "Kind: fix\n- Old change\n");
    expect(whatsNew.recordRelease(root, "1.0.123")).toBe(1);
    note("111-b.md", "Kind: feature\n- New change\n");
    expect(whatsNew.recordRelease(root, "1.0.124")).toBe(1);

    const history = readFileSync(join(root, "WHATS_NEW.md"), "utf8");
    const after = history.slice(history.indexOf(whatsNew.HISTORY_MARKER));
    expect(after).toBe(
      `${whatsNew.HISTORY_MARKER}\n\n## 1.0.124 (New feature)\n\n- New change\n\n## 1.0.123 (Fix)\n\n- Old change\n`,
    );
    expect(readdirSync(join(root, "whats-new"))).toEqual(["README.md"]);
  });

  it("records nothing twice for one version", () => {
    note("108-a.md", "- A change\n");
    whatsNew.recordRelease(root, "1.0.123");
    note("109-b.md", "- Another\n");
    expect(whatsNew.recordRelease(root, "1.0.123")).toBe(0);
    expect(readdirSync(join(root, "whats-new")).sort()).toEqual(["109-b.md", "README.md"]);
  });

  it("does nothing when nothing is pending", () => {
    const before = readFileSync(join(root, "WHATS_NEW.md"), "utf8");
    expect(whatsNew.recordRelease(root, "1.0.123")).toBe(0);
    expect(readFileSync(join(root, "WHATS_NEW.md"), "utf8")).toBe(before);
  });

  it("refuses a version CI would not have written", () => {
    expect(() => whatsNew.recordRelease(root, "latest")).toThrow(/not a release version/);
  });
});

describe("the history a build carries", () => {
  it("reads WHATS_NEW.md back, labels and all, and ignores what sits above the marker", () => {
    const history = [
      "# What's new",
      "",
      "- **New feature**: an explanation bullet, not a release",
      "",
      whatsNew.HISTORY_MARKER,
      "",
      "## 1.0.124 (New feature)",
      "",
      "- Added",
      "- Also added",
      "",
      "## 1.0.123",
      "",
      "- From before labels",
      "",
      "## 1.0.122 (Beta)",
      "",
      "- Unknown label",
    ].join("\n");
    expect(whatsNew.recordedReleases(history)).toEqual([
      { version: "1.0.124", kind: "feature", notes: ["Added", "Also added"] },
      { version: "1.0.123", kind: "improvement", notes: ["From before labels"] },
      { version: "1.0.122", kind: "improvement", notes: ["Unknown label"] },
    ]);
  });

  it("carries a CI build's own pending notes as its version, newest first", () => {
    note("108-a.md", "Kind: fix\n- Old change\n");
    whatsNew.recordRelease(root, "1.0.99");
    note("111-b.md", "Kind: feature\n- About to ship\n");
    expect(whatsNew.releaseHistory(root, "1.0.100")).toEqual([
      { version: "1.0.100", kind: "feature", notes: ["About to ship"] },
      { version: "1.0.99", kind: "fix", notes: ["Old change"] },
    ]);
  });

  it("leaves pending notes out of a local build, which is no release", () => {
    note("108-a.md", "- Not released\n");
    expect(whatsNew.releaseHistory(root)).toEqual([]);
  });

  it("does not file pending notes under a version that already shipped", () => {
    note("108-a.md", "- Shipped\n");
    whatsNew.recordRelease(root, "1.0.99");
    note("109-b.md", "- Next\n");
    expect(whatsNew.releaseHistory(root, "1.0.99")).toEqual([
      { version: "1.0.99", kind: "improvement", notes: ["Shipped"] },
    ]);
  });
});
