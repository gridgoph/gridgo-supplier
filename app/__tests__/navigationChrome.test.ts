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

  /**
   * The captain's decision, after a crew tried labelling the control "Back"
   * because riders were missing the bare chevron: the chevron alone is what
   * they want. `headerBackButtonDisplayMode: "minimal"` gives exactly that and
   * is also what stops iOS falling back to the previous route's title — without
   * it a shop hears "(tabs)". So the rule is not "no Back label", it is "always
   * minimal", and dropping the option to remove the label would bring the route
   * group name back.
   */
  it("shows a bare chevron back control, never a worded one", () => {
    const sources = [
      ...files.map((file) => [path.relative(ROOT, file), fs.readFileSync(file, "utf8")] as const),
      [
        "lib/navigationOptions.ts",
        fs.readFileSync(path.join(ROOT, "lib/navigationOptions.ts"), "utf8"),
      ] as const,
    ];

    for (const [file, source] of sources) {
      expect({ file, source }).toEqual({
        file,
        source: expect.not.stringContaining("headerBackTitle"),
      });
    }

    const chrome = fs.readFileSync(path.join(ROOT, "lib/navigationOptions.ts"), "utf8");
    expect(chrome).toContain('headerBackButtonDisplayMode: "minimal"');
  });

  it("swaps tab content instantly, under a bar that does not move", () => {
    const tabs = fs.readFileSync(path.join(ROOT, "app/(tabs)/_layout.tsx"), "utf8");

    expect(tabs).toContain('animation: "none"');
  });
});
