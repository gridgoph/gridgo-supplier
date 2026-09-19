import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

import { fontAssets, fontFamily } from "@/constants/fonts";

/**
 * Satoshi only reaches a release APK if the expo-font config plugin embeds
 * every cut at prebuild. A bare `"expo-font"` string copies nothing, and
 * Android then paints the system UI font.
 *
 * Family names must match the plugin's Android rule: filename without
 * extension. `useFonts` registers the same names so Expo Go stays in step.
 */

const root = join(__dirname, "..");
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: { plugins?: unknown[] };
};

function expoFontPluginConfig(plugins: unknown[] | undefined): { fonts?: unknown } {
  const entry = (plugins ?? []).find(
    (plugin) =>
      plugin === "expo-font" ||
      (Array.isArray(plugin) && plugin[0] === "expo-font"),
  );
  if (entry === "expo-font") {
    throw new Error(
      'app.json lists "expo-font" as a bare plugin string, so prebuild embeds no fonts',
    );
  }
  if (!Array.isArray(entry)) {
    throw new Error("app.json is missing the expo-font config plugin");
  }
  const config = entry[1];
  if (!config || typeof config !== "object") {
    throw new Error("expo-font plugin is listed without a fonts array");
  }
  return config as { fonts?: unknown };
}

describe("Satoshi font declaration", () => {
  const pluginFonts = expoFontPluginConfig(appJson.expo.plugins).fonts;

  it("embeds every Satoshi cut through the expo-font plugin", () => {
    expect(Array.isArray(pluginFonts)).toBe(true);
    const paths = [...(pluginFonts as string[])].sort();
    const expected = Object.keys(fontAssets)
      .map((family) => `./assets/fonts/${family}.otf`)
      .sort();
    expect(paths).toEqual(expected);
  });

  it("registers family names that match the plugin filenames", () => {
    const families = Object.keys(fontAssets);
    expect(Object.values(fontFamily)).toEqual(families);

    for (const path of pluginFonts as string[]) {
      expect(path.startsWith("./assets/fonts/")).toBe(true);
      expect(path.endsWith(".otf")).toBe(true);
      expect(existsSync(join(root, path))).toBe(true);
      const family = basename(path, ".otf");
      expect(families).toContain(family);
      expect(fontAssets[family]).toEqual(expect.any(Number));
    }
  });
});
