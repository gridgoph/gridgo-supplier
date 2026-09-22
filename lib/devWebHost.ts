const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Clerk's development `__clerk_db_jwt` cookie is host-scoped, not port-scoped.
 * `localhost:8082` therefore shares a session with client :8081 and rider
 * :8083. Each Expo web app lives on its own `*.localhost` host so the cookies
 * stay apart. Metro already listens on every interface; Chromium resolves
 * `*.localhost` to loopback without a hosts file.
 */
export const GRIDGO_DEV_WEB_HOST = "supplier.localhost";

type DevWebLocation = {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
  search: string;
  hash: string;
};

export function isolatedDevWebHref(location: DevWebLocation, isolatedHost: string): string | null {
  if (location.hostname === isolatedHost) return null;
  if (!LOOPBACK.has(location.hostname)) return null;
  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//${isolatedHost}${port}${location.pathname}${location.search}${location.hash}`;
}

export function bounceToIsolatedDevWebHost(isolatedHost: string): boolean {
  if (typeof process !== "undefined" && process.env.JEST_WORKER_ID) return false;
  if (typeof __DEV__ !== "undefined" && !__DEV__) return false;
  if (typeof window === "undefined") return false;
  const href = isolatedDevWebHref(window.location, isolatedHost);
  if (!href) return false;
  window.location.replace(href);
  return true;
}
