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

/**
 * A handover is being prepared: the signed-in person's push is coming off.
 *
 * Only new push registrations stop for this. The phone is not shared yet —
 * the session does not open the picker until the removal has succeeded and
 * `setSharedDevice(true)` follows — so a refusal leaves the Owner's screens
 * exactly as they were.
 */
let handoverPending = false;

export function setHandoverPending(next: boolean): void {
  handoverPending = next;
}

/** Whether personal push registration must wait: shared, or about to be. */
export function personalPushPaused(): boolean {
  return shared || handoverPending;
}

/**
 * A camera, gallery or file picker this app opened itself, still open.
 *
 * On a shared phone every trip to the background locks the worker's turn
 * (gridgo-api `docs/SHOP_TEAM_API.md`: lock on handover and background), with
 * one exception scoped to exactly this: the system picker a worker opened to
 * photograph their work sends the app to the background too, and locking then
 * would throw them out of the step they were finishing. Only a call wrapped
 * here counts; anything else in the background is a phone put down.
 */
let pickersOpen = 0;

export async function withSystemPicker<T>(open: () => Promise<T>): Promise<T> {
  pickersOpen += 1;
  try {
    return await open();
  } finally {
    pickersOpen -= 1;
  }
}

export function systemPickerOpen(): boolean {
  return pickersOpen > 0;
}
