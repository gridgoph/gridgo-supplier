import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function layoutFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "__tests__") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "_layout.tsx") out.push(full);
    }
  };
  walk(path.join(ROOT, "app"));
  return out;
}

/** Every `<Stack.Screen … />` element, whole, so its options can be read. */
function stackScreens(source: string): string[] {
  return [...source.matchAll(/<Stack\.Screen[\s\S]*?\/>/g)].map((m) => m[0]);
}

function nameOf(element: string): string {
  return /name="([^"]*)"/.exec(element)?.[1] ?? "(unnamed)";
}

/**
 * The captain's report: "there are bugs where not all have Back".
 *
 * A screen pushed above the tab shell has to give a way back, and on a native
 * stack that comes from the header. So a screen either draws a header — in
 * which case it needs a title, or iOS labels the control with the route group
 * and a person hears "(tabs)" — or it turns the header off and owns the way out
 * itself, which is a decision worth stating rather than inheriting.
 */
describe("every stack screen keeps a way back", () => {
  const files = layoutFiles();

  it("finds the layouts", () => {
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it("never hides the back control on a screen that draws a header", () => {
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect({ file, source }).toEqual({
        file,
        source: expect.not.stringContaining("headerBackVisible: false"),
      });
      expect({ file, source }).toEqual({
        file,
        source: expect.not.stringContaining("headerLeft: null"),
      });
    }
  });

  it("titles every screen that keeps its header", () => {
    const untitled: string[] = [];

    for (const file of files) {
      for (const element of stackScreens(fs.readFileSync(file, "utf8"))) {
        // A sheet route is presented by the navigator with its header off and
        // its own labelled cancel inside — see `sheetScreenOptions`.
        if (element.includes("sheetScreenOptions")) continue;
        if (element.includes("headerShown: false")) continue;
        if (!/title:/.test(element)) {
          untitled.push(`${path.relative(ROOT, file)}: ${nameOf(element)}`);
        }
      }
    }

    expect(untitled).toEqual([]);
  });

  it("swaps tab content instantly, under a bar that does not move", () => {
    const tabs = fs.readFileSync(path.join(ROOT, "app/(tabs)/_layout.tsx"), "utf8");

    expect(tabs).toContain('animation: "none"');
  });
});
