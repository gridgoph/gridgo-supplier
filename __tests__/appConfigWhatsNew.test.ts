import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { whatsNewHistory } from "../app.config";

// Its own fixture: the repository's notes change with every release.
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "app-config-whats-new-"));
  mkdirSync(join(root, "whats-new"));
  writeFileSync(
    join(root, "WHATS_NEW.md"),
    "# What's new\n\n<!-- CI adds each release below this line. -->\n\n## 1.0.9 (Fix)\n\n- Mended\n",
  );
  writeFileSync(join(root, "whats-new", "12-next.md"), "Kind: feature\n- Coming in this build\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the What's new history a build carries", () => {
  it("is WHATS_NEW.md plus a CI build's own pending notes, newest first", () => {
    expect(whatsNewHistory(root, "12", "1.0.12")).toEqual([
      { version: "1.0.12", kind: "feature", notes: ["Coming in this build"] },
      { version: "1.0.9", kind: "fix", notes: ["Mended"] },
    ]);
  });

  it("leaves the pending notes out of a local build", () => {
    expect(whatsNewHistory(root, undefined, "1.0.0")).toEqual([
      { version: "1.0.9", kind: "fix", notes: ["Mended"] },
    ]);
  });
});
