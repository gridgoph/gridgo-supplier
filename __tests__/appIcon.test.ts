import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { ExpoConfig } from "expo/config";

/**
 * The home-screen icon is the GRIDGO 3×3 mark, not the Expo chevron.
 *
 * `app.json` is the source of the paths Expo prebuild copies into the
 * native project. A leftover `react-logo*` asset or the default Expo
 * `#E6F4FE` plate would put the blue chevron back on the launcher.
 */

const root = join(__dirname, "..");
const images = join(root, "assets/images");
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: ExpoConfig;
};

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function pluginOptions(name: string): Record<string, unknown> {
  const entry = (appJson.expo.plugins ?? []).find(
    (plugin) => Array.isArray(plugin) && plugin[0] === name,
  );
  if (!Array.isArray(entry) || entry[1] == null || typeof entry[1] !== "object") {
    throw new Error(`app.json is missing the ${name} plugin options`);
  }
  return entry[1] as Record<string, unknown>;
}

describe("GRIDGO app icon", () => {
  it("points icon, adaptive layers, favicon and splash at the mark files", () => {
    expect(appJson.expo.icon).toBe("./assets/images/icon.png");
    expect(appJson.expo.android?.adaptiveIcon).toEqual({
      backgroundColor: "#FFFFFF",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    });
    expect(appJson.expo.web?.favicon).toBe("./assets/images/favicon.png");

    const splash = pluginOptions("expo-splash-screen");
    expect(splash.image).toBe("./assets/images/splash-icon.png");
    expect(splash.backgroundColor).toBe("#ffffff");
    expect(splash.dark).toEqual({
      image: "./assets/images/splash-icon-dark.png",
      backgroundColor: "#000000",
    });
  });

  it("does not keep the Expo default blue plate", () => {
    const encoded = JSON.stringify(appJson);
    expect(encoded).not.toContain("#E6F4FE");
    expect(encoded).not.toContain("#e6f4fe");
  });

  it("ships 1024×1024 icon, adaptive and splash rasters", () => {
    const expected = [
      "icon.png",
      "android-icon-foreground.png",
      "android-icon-background.png",
      "android-icon-monochrome.png",
      "splash-icon.png",
      "splash-icon-dark.png",
    ];
    for (const name of expected) {
      const path = join(images, name);
      expect(existsSync(path)).toBe(true);
      expect(pngSize(path)).toEqual({ width: 1024, height: 1024 });
    }
    expect(pngSize(join(images, "favicon.png"))).toEqual({
      width: 48,
      height: 48,
    });
  });

  it("drops leftover Expo react-logo assets", () => {
    const names = readdirSync(images);
    expect(names.filter((name) => name.includes("react-logo"))).toEqual([]);
    expect(names).not.toContain("partial-react-logo.png");
  });
});
