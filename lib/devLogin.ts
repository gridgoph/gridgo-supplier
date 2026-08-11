/**
 * Development-only sign-in prefill — and the reason it is shaped this way.
 *
 * This binary is installed on shops' phones. Prefilling a demo account on a
 * hosted or release build hands anyone who opens it a one-tap way into a
 * supplier session. Rotating passwords does not fix that — the address is the
 * disclosure.
 *
 * So the credentials are not hidden behind a runtime flag or an environment
 * variable read at startup. Either still ships the literals inside the bundle
 * where anyone can read them. `__DEV__` is substituted by Metro at bundle time,
 * so a production build folds this to `null` and the literals are dropped from
 * the emitted bundle entirely.
 *
 * Written inline inside the true branch deliberately — a top-level constant
 * would sit outside the branch the compiler discards and would survive on tree
 * shaking rather than on the guard.
 *
 * Source of truth: gridgo-api `src/demo-fixtures.js` (supplier identity and
 * `DEMO_PASSWORD`). Domain taken from the in-flight `@gridgo.local` →
 * `@gridgo.ph` migration fixtures.
 *
 * Lives under `lib/`, not `app/`, so Expo Router never mounts it as a route.
 *
 * Proved by `app/__tests__/devLoginDisclosure.test.ts` (source shape) and
 * `scripts/assert-no-dev-credentials.mjs` (production export contents).
 */
export type DevLogin = {
  email: string;
  password: string;
};

export const DEV_LOGIN: DevLogin | null = __DEV__
  ? {
      email: "supplier@gridgo.ph",
      // gridgo-api DEMO_PASSWORD — local fixture only; never a hosted secret.
      password: "Ilovegridgo-0990",
    }
  : null;
