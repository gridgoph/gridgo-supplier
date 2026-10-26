import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(__dirname, "..");
const cases = [
  ["web", "@/components/MapFrame", "components/MapFrame.web.tsx"],
  ["android", "@/components/MapFrame", "components/MapFrame.tsx"],
  ["ios", "@/components/MapFrame", "components/MapFrame.tsx"],
  ["ios", "@/components/AppleSignInButton", "components/AppleSignInButton.ios.tsx"],
  ["ios", "@/lib/appleReauthorize", "lib/appleReauthorize.ios.ts"],
  ["ios", "@/lib/firebaseMessaging", "lib/firebaseMessaging.ios.ts"],
  ["android", "@/lib/firebaseMessaging", "lib/firebaseMessaging.ts"],
  ["ios", "@/constants/fonts", "constants/fonts.ts"],
  ["ios", "@/components/illustrations", "components/illustrations/index.ts"],
  ["android", "./components/MapFrame", "components/MapFrame.tsx"],
] as const;

// Load the exported config in plain Node: Jest's Expo preset mocks Metro's
// dependencies and its own resolver cannot reproduce a bundling regression.
let resolutions: { type: string; filePath?: string; filePaths?: string[] }[];
beforeAll(() => {
  resolutions = JSON.parse(execFileSync(process.execPath, ["-e", `
    const fs = require("node:fs");
    const path = require("node:path");
    const { resolve } = require("metro-resolver");
    const config = require("./metro.config.js");
    const context = {
      ...config.resolver,
      assetExts: new Set(config.resolver.assetExts),
      originModulePath: path.join(process.cwd(), "metro.config.js"),
      getPackage: (file) => JSON.parse(fs.readFileSync(file, "utf8")),
      getPackageForModule: () => null,
      doesFileExist: (file) => fs.existsSync(file) && fs.statSync(file).isFile(),
      fileSystemLookup: (file) => {
        try {
          const stat = fs.statSync(file);
          return { exists: true, type: stat.isDirectory() ? "d" : "f", realPath: fs.realpathSync(file) };
        } catch (error) {
          if (error.code === "ENOENT" || error.code === "ENOTDIR") return { exists: false };
          throw error;
        }
      },
      redirectModulePath: (file) => file,
      resolveAsset: (dir, name, ext) => [path.join(dir, name + ext)].filter(fs.existsSync),
      resolveRequest: resolve,
    };
    const cases = JSON.parse(process.argv[1]);
    process.stdout.write(JSON.stringify(cases.map(([platform, name]) =>
      config.resolver.resolveRequest({ ...context, preferNativePlatform: platform !== "web" }, name, platform)
    )));
  `, JSON.stringify([
    ...cases,
    ["ios", "@/assets/images/icon.png"],
    ["web", "zustand/middleware"],
    ["android", "react-native-css-metro-override"],
  ])], { cwd: root, encoding: "utf8" }));
});

describe("the exported Metro resolver", () => {
  it.each(cases.map(([platform, name, expected], index) => ({ platform, name, expected, index })))(
    "resolves $name on $platform to $expected",
    ({ expected, index }) => {
      expect(resolutions[index]).toEqual({ type: "sourceFile", filePath: resolve(root, expected) });
    },
  );

  it("lets Metro classify an aliased image as an asset", () => {
    expect(resolutions[cases.length]).toEqual({
      type: "assetFiles",
      filePaths: [resolve(root, "assets/images/icon.png")],
    });
  });

  it("keeps the web zustand CommonJS workaround", () => {
    expect(resolutions[cases.length + 1]).toEqual({
      type: "sourceFile",
      filePath: resolve(root, "node_modules/zustand/middleware.js"),
    });
  });

  it("preserves NativeWind's wrapped resolver", () => {
    expect(resolutions[cases.length + 2]).toEqual({
      type: "sourceFile",
      filePath: resolve(root, "node_modules/react-native-css/dist/commonjs/metro/override.js"),
    });
  });
});
