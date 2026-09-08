/** Silent refresh hints. Never contains domain data or grants access. */
export const LIVE_RESOURCES = ["orders", "jobs", "approvals", "escalations", "claims", "dispatch", "payouts", "notifications", "identity", "catalog", "services", "availability", "settings", "location", "credits"] as const;
export type LiveResource = typeof LIVE_RESOURCES[number];
export type Invalidation = { resource: LiveResource; id?: string };
type Listener = (resource: LiveResource | "*") => void;
const listeners = new Set<Listener>();
let owner: string | null = null;
let generation = 0;
export const liveGeneration = () => generation;
export function setLiveOwner(next: string | null): void {
  if (owner === next) return;
  owner = next;
  generation += 1;
}
export function assertLiveGeneration(expected: number): void {
  if (expected !== generation) throw new Error("The account changed. Open this screen again.");
}
export function invalidate(resource: LiveResource | "*" = "*"): void {
  for (const listener of listeners) listener(resource);
}
export function subscribeLive(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function readInvalidation(data: string): Invalidation | null {
  try {
    const value = JSON.parse(data) as Partial<Invalidation>;
    if (!value || !LIVE_RESOURCES.includes(value.resource as LiveResource)) return null;
    if (value.id !== undefined && typeof value.id !== "string") return null;
    return { resource: value.resource as LiveResource, ...(value.id ? { id: value.id } : {}) };
  } catch { return null; }
}
