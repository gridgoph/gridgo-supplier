import { readFileSync } from "fs";
import { join } from "path";

import { colors } from "@/constants/theme";

/**
 * Review F4: the editor's 12px captions were in `textMuted`, which misses
 * WCAG AA (4.5:1) on the grouped panel — 3.77:1 Light, 4.22:1 Dark. They are
 * `textSecondary` now; this pins both the token pair and the usage.
 */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

it("puts caption text at AA or better on every background the editor draws it on", () => {
  for (const theme of ["light", "dark"] as const) {
    const t = colors[theme];
    for (const background of [t.surfaceVariant, t.surface]) {
      expect(contrast(t.textSecondary, background)).toBeGreaterThanOrEqual(4.5);
    }
  }
});

it("draws no text in the muted colour in the shop-location editor", () => {
  const source = readFileSync(join(__dirname, "..", "ShopLocationPicker.tsx"), "utf8");
  expect(source).not.toMatch(/text-text-muted/);
  expect(source).toMatch(/<WhyWeAsk readable>/);
});
