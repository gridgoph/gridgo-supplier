/**
 * Development-only auth breadcrumbs. Never pass tokens, passwords, or secrets.
 */
export function debugAuth(event: string, fields: Record<string, unknown> = {}): void {
  if (typeof __DEV__ !== "undefined" && !__DEV__) return;
  console.log(`[gridgo-supplier] ${event}`, fields);
}
