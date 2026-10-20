// Learn more https://docs.expo.io/guides/customizing-metro
const os = require("os");
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

// Windows caps a process around 512 open handles. Metro's cache and transform
// workers share that table (worker threads) and open one file per module with
// no backoff, so a cold web bundle dies with EMFILE — including the log-box
// CSS that then fails to paint the error. Queue cache IO, retry the specific
// error, and give transforms their own process so they are not competing with
// the file map for the same handle limit.
if (process.platform === "win32") {
  const limit = createLimiter(8);
  if (Array.isArray(config.cacheStores)) {
    for (const store of config.cacheStores) {
      for (const method of ["get", "set"]) {
        const original = store[method];
        if (typeof original !== "function") continue;
        store[method] = (...args) =>
          limit(() => retryEmfile(() => original.apply(store, args)));
      }
    }
  }
  const cpus = os.cpus().length || 2;
  config.maxWorkers = Math.min(config.maxWorkers ?? cpus, 2);
  config.transformer.unstable_workerThreads = false;
}

function createLimiter(concurrency) {
  let active = 0;
  const pending = [];
  const pump = () => {
    while (active < concurrency && pending.length > 0) {
      const job = pending.shift();
      active += 1;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };
  return (run) =>
    new Promise((resolve, reject) => {
      pending.push({ run, resolve, reject });
      pump();
    });
}

function retryEmfile(run) {
  const waits = [15, 40, 80, 160, 320, 640];
  return (async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        if (error?.code !== "EMFILE" || attempt >= waits.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, waits[attempt]));
      }
    }
  })();
}

module.exports = config;
