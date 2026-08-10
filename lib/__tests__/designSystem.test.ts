import fs from "node:fs";
import path from "node:path";

import {
  classNamesIn,
  parseVocabulary,
  unresolvedClass,
  type DesignSystemVocabulary,
} from "@/lib/designSystem";

const ROOT = path.resolve(__dirname, "../..");

function readCss(): DesignSystemVocabulary {
  return parseVocabulary(fs.readFileSync(path.join(ROOT, "global.css"), "utf8"));
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

describe("parseVocabulary", () => {
  it("reads the tokens and utilities global.css defines", () => {
    const vocabulary = readCss();

    expect(vocabulary.colors).toContain("canvas");
    expect(vocabulary.colors).toContain("action-yellow");
    expect(vocabulary.colors).toContain("text-primary");
    expect(vocabulary.fonts).toContain("bold");
    expect(vocabulary.radii).toContain("field");
    expect(vocabulary.shadows).toContain("sheet");
    expect(vocabulary.utilities).toContain("gg-card");
    expect(vocabulary.utilities).toContain("text-body");
  });
});

describe("unresolvedClass", () => {
  const vocabulary = readCss();
  const check = (token: string) => unresolvedClass(token, vocabulary);

  it("accepts the vocabulary this project actually defines", () => {
    for (const token of [
      "gg-card",
      "gg-btn-primary",
      "text-h2",
      "text-body",
      "text-overline",
      "text-text-primary",
      "text-action-yellow-on",
      "bg-canvas",
      "bg-surface-variant",
      "border-outline-subtle",
      "border-t",
      "border",
      "rounded-field",
      "rounded-t-card",
      "rounded-pill",
      "shadow-card",
      "font-medium",
      "font-brand",
      "dark:bg-surface",
      "outline-2",
      "outline-offset-2",
      "text-center",
      "flex-1",
      "mt-6",
      "gap-3",
      "opacity-[0.38]",
    ]) {
      expect({ token, problem: check(token) }).toEqual({ token, problem: null });
    }
  });

  it("catches the classes this project's reset scales silently drop", () => {
    // Exactly what shipped on the login screen across the GRIDGO fleet.
    expect(check("font-satoshi")).toContain("--font-*");
    expect(check("font-satoshi-bold")).toContain("--font-*");
    expect(check("font-semibold")).toContain("--font-*");
    expect(check("text-2xl")).toContain("--color-*");
    expect(check("text-sm")).toContain("--color-*");
    expect(check("bg-blue-500")).toContain("--color-*");
    expect(check("rounded-3xl")).toContain("--radius-*");
    expect(check("rounded-full")).toContain("--radius-*");
    expect(check("rounded")).toContain("radius scale is reset");
    expect(check("shadow-lg")).toContain("--shadow-*");
    expect(check("gg-panel-low")).toContain("@utility");
  });
});

describe("classNamesIn", () => {
  it("reads literals from both attribute forms", () => {
    const source = `
      <View className="gg-card gap-3" />
      <Text className={selected ? "text-body font-medium" : "text-caption"} />
      <Pressable contentContainerClassName="gg-page pb-10" />
    `;

    expect(classNamesIn(source)).toEqual([
      "gg-card",
      "gap-3",
      "text-body",
      "font-medium",
      "text-caption",
      "gg-page",
      "pb-10",
    ]);
  });
});

/**
 * The guard itself.
 *
 * A class that names a token this project never defined is not an error at
 * build time — it compiles to nothing and the screen quietly renders in the
 * system font at default sizing. This is what stops one creeping back in.
 */
describe("every class in the app resolves", () => {
  it("finds no class naming a token global.css does not define", () => {
    const vocabulary = readCss();
    const problems: string[] = [];

    for (const dir of ["app", "components"]) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        for (const token of classNamesIn(fs.readFileSync(file, "utf8"))) {
          const problem = unresolvedClass(token, vocabulary);
          if (problem) problems.push(`${path.relative(ROOT, file)}: ${problem}`);
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
