// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const { withNativewind } = require("nativewind/metro");

/** @type {import('expo/metro-config').MetroConfig} */
const base = getDefaultConfig(__dirname);

const config = withNativewind(base, {
  // The whole theme is driven by :root variables that carry a
  // prefers-color-scheme rule. Inlining them at build time would flatten a
  // token to its Light value and break theme switching for that token.
  inlineVariables: false,
});

/**
 * Resolve zustand through its CommonJS build on web.
 *
 * zustand's `exports` map serves native the CJS build (via the `react-native`
 * condition) and everyone else an ESM build whose devtools middleware reads
 * `import.meta.env`. Metro emits web as a classic script, so `import.meta` is a
 * syntax error there and the *entire* bundle fails to evaluate — the page stays
 * blank with one console error and no stack pointing at the cause.
 *
 * This wraps the resolver **after** `withNativewind`, which installs one of its
 * own; wrapping before would be silently replaced.
 */
const wrapped = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const next = wrapped ?? context.resolveRequest;
  if (platform === "web" && /^zustand($|\/)/.test(moduleName)) {
    return {
      type: "sourceFile",
      filePath: require.resolve(moduleName, { paths: [__dirname] }),
    };
  }
  return next(context, moduleName, platform);
};

module.exports = config;
