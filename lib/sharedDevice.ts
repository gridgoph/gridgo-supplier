/**
 * Whether this phone is being shared by phone-free teammates right now.
 *
 * A plain flag rather than a store so `store/push.ts` can read it without
 * importing the team stores (`store/shopWorker.ts` owns setting it). While it
 * is on, nothing registers this phone for the signed-in person's push: GRIDGO
 * refuses personal notification routes inside a shared session, and an Owner's
 * job alerts must not wake a counter phone.
 */
let shared = false;

export function setSharedDevice(next: boolean): void {
  shared = next;
}

export function isSharedDevice(): boolean {
  return shared;
}
