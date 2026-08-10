/**
 * What `global.css` actually defines, read from the file itself.
 *
 * This project resets Tailwind's built-in colour, type, radius, weight and
 * shadow scales to `initial` so only GRIDGO tokens exist. The cost of that is
 * that a class naming a token which was never defined — `font-satoshi-bold`,
 * `text-2xl` — is not an error. It compiles to nothing, and the screen renders
 * in the system font at the browser's default size. Silent, and it shipped on
 * the first screen a supplier ever sees.
 *
 * `lib/__tests__/designSystem.test.ts` uses this to fail the build when a class
 * name in `app/` or `components/` cannot resolve to something defined here.
 */

export type DesignSystemVocabulary = {
  /** `--color-*` names: `canvas`, `text-primary`, `action-yellow`, … */
  colors: Set<string>;
  /** `--font-*` names: `sans`, `medium`, `bold`, `brand`, … */
  fonts: Set<string>;
  /** `--radius-*` names: `sm`, `field`, `card`, `pill`, … */
  radii: Set<string>;
  /** `--shadow-*` names: `card`, `sheet`. */
  shadows: Set<string>;
  /** `@utility` names: `text-body`, `gg-card`, `gg-btn-primary`, … */
  utilities: Set<string>;
};

/** Pull every token and utility name out of the CSS layer. */
export function parseVocabulary(css: string): DesignSystemVocabulary {
  const vocabulary: DesignSystemVocabulary = {
    colors: new Set(),
    fonts: new Set(),
    radii: new Set(),
    shadows: new Set(),
    utilities: new Set(),
  };

  for (const [, name] of css.matchAll(/--color-([a-z0-9-]+)\s*:/g)) {
    if (name !== "*") vocabulary.colors.add(name);
  }
  for (const [, name] of css.matchAll(/--font-([a-z0-9-]+)\s*:/g)) {
    if (!name.startsWith("weight")) vocabulary.fonts.add(name);
  }
  for (const [, name] of css.matchAll(/--radius-([a-z0-9-]+)\s*:/g)) {
    vocabulary.radii.add(name);
  }
  for (const [, name] of css.matchAll(/--shadow-([a-z0-9-]+)\s*:/g)) {
    vocabulary.shadows.add(name);
  }
  for (const [, name] of css.matchAll(/@utility\s+([a-z0-9-]+)/g)) {
    vocabulary.utilities.add(name);
  }

  return vocabulary;
}

/** Tailwind utilities in these families that are not token lookups. */
const TEXT_KEYWORDS = new Set([
  "left",
  "center",
  "right",
  "justify",
  "start",
  "end",
  "wrap",
  "nowrap",
  "balance",
  "pretty",
  "ellipsis",
  "clip",
]);

const BORDER_KEYWORDS = new Set([
  "t",
  "r",
  "b",
  "l",
  "x",
  "y",
  "s",
  "e",
  "solid",
  "dashed",
  "dotted",
  "double",
  "hidden",
  "none",
  "collapse",
  "separate",
  "spacing",
]);

const ROUNDED_SIDES = new Set([
  "t",
  "r",
  "b",
  "l",
  "s",
  "e",
  "tl",
  "tr",
  "br",
  "bl",
  "ss",
  "se",
  "ee",
  "es",
]);

const OUTLINE_KEYWORDS = new Set(["none", "hidden", "solid", "dashed", "dotted", "double", "offset"]);

/** Strip `dark:`, `hover:` and friends, and the `!` important marker. */
function base(token: string): string {
  const withoutVariants = token.slice(token.lastIndexOf(":") + 1);
  return withoutVariants.replace(/^!/, "");
}

function isNumeric(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value);
}

/**
 * Why this class name cannot resolve, or null when it can.
 *
 * Only the families whose scales this project reset are checked — everything
 * else (spacing, flexbox, sizing) still has Tailwind's own defaults behind it,
 * so a wrong value there is a visible mistake rather than a silent one.
 */
export function unresolvedClass(
  token: string,
  vocabulary: DesignSystemVocabulary,
): string | null {
  const name = base(token);
  if (!name || name.includes("[") || name.includes("(")) return null;

  if (vocabulary.utilities.has(name)) return null;

  if (name.startsWith("gg-")) {
    return `"${name}" is not a @utility in global.css`;
  }

  if (name.startsWith("font-")) {
    const value = name.slice(5);
    if (vocabulary.fonts.has(value)) return null;
    return `"${name}" is not a --font-* family in global.css (the weight scale is reset)`;
  }

  if (name.startsWith("text-")) {
    const value = name.slice(5);
    if (TEXT_KEYWORDS.has(value) || isNumeric(value)) return null;
    if (vocabulary.colors.has(value)) return null;
    return `"${name}" is neither a --color-* token nor a text @utility in global.css`;
  }

  if (name.startsWith("bg-")) {
    const value = name.slice(3);
    if (vocabulary.colors.has(value)) return null;
    return `"${name}" is not a --color-* token in global.css`;
  }

  if (name.startsWith("border-")) {
    const value = name.slice(7);
    if (BORDER_KEYWORDS.has(value) || isNumeric(value)) return null;
    // `border-t-2`, `border-x-outline`
    const [side, ...rest] = value.split("-");
    if (BORDER_KEYWORDS.has(side) && rest.length) {
      const tail = rest.join("-");
      if (isNumeric(tail) || vocabulary.colors.has(tail)) return null;
    }
    if (vocabulary.colors.has(value)) return null;
    return `"${name}" is not a --color-* token in global.css`;
  }

  if (name.startsWith("rounded-")) {
    const value = name.slice(8);
    if (vocabulary.radii.has(value)) return null;
    const [side, ...rest] = value.split("-");
    if (ROUNDED_SIDES.has(side) && vocabulary.radii.has(rest.join("-"))) return null;
    return `"${name}" is not a --radius-* token in global.css`;
  }

  if (name === "rounded") {
    return `"rounded" has no value — the radius scale is reset, so name one (rounded-field, rounded-card, rounded-pill)`;
  }

  if (name.startsWith("shadow-")) {
    const value = name.slice(7);
    if (vocabulary.shadows.has(value) || value === "none") return null;
    return `"${name}" is not a --shadow-* token in global.css`;
  }

  if (name.startsWith("outline-")) {
    const value = name.slice(8);
    if (OUTLINE_KEYWORDS.has(value) || isNumeric(value)) return null;
    if (value.startsWith("offset-")) return null;
    if (vocabulary.colors.has(value)) return null;
    return `"${name}" is not a --color-* token in global.css`;
  }

  return null;
}

/**
 * Class names written in a source file.
 *
 * Only string literals are read, which is exactly how NativeWind can see them
 * too — a class assembled at runtime from a variable never reaches the compiler
 * either, so anything this misses was already broken.
 */
export function classNamesIn(source: string): string[] {
  const found: string[] = [];
  // `contentContainerClassName` carries classes too, hence the capital.
  const attribute = /[cC]lassName\s*(?:=|:)\s*(?:\{)?/g;

  let match: RegExpExecArray | null;
  while ((match = attribute.exec(source)) != null) {
    // Read literals until the attribute's expression closes.
    const rest = source.slice(match.index + match[0].length);
    const end = expressionEnd(rest);
    for (const [, quoted] of rest.slice(0, end).matchAll(/["'`]([^"'`]*)["'`]/g)) {
      for (const token of quoted.split(/\s+/)) {
        if (token) found.push(token);
      }
    }
  }
  return found;
}

/** End of a `className` value: the closing brace, or the end of one literal. */
function expressionEnd(rest: string): number {
  if (/^["'`]/.test(rest)) {
    const quote = rest[0];
    const close = rest.indexOf(quote, 1);
    return close === -1 ? rest.length : close + 1;
  }
  let depth = 1;
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i] === "{") depth += 1;
    else if (rest[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return rest.length;
}
