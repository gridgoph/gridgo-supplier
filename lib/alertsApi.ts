import * as api from "@/lib/api";

/**
 * Reading and deleting alerts, behind one adapter.
 *
 * ## Why this file exists, and when it should stop existing
 *
 * A notification record has carried a `read` flag since operational model v2,
 * and until now `GET /notifications` was the whole surface — nothing could set
 * it. So this app remembered on the device which alerts a shop had dealt with,
 * which is honest but wrong in two ways a shop can feel: it does not follow
 * them to another phone, and it cannot delete anything.
 *
 * The platform is adding mark-one-read, mark-many-read and delete. This module
 * calls them and treats a missing route as a fact rather than a failure, so the
 * app works either side of that release.
 *
 * **When the routes land**: point this module at the shipped shapes, then
 * delete `store/alerts.ts`'s `dismissed` and `deleted` lists — the whole
 * device-local fallback — and the caveat lines on `app/(tabs)/notifications`
 * that exist to describe it. Nothing else reads them.
 */

export type AlertWriteOutcome =
  | { status: "saved" }
  | { status: "not_open_yet" }
  | { status: "failed"; message: string };

/** 404/405 mean the route is not there. Anything else is a real failure. */
function isRouteAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

function failure(error: unknown, verb: string): AlertWriteOutcome {
  if (error instanceof api.ApiError) {
    return {
      status: "failed",
      message:
        error.status >= 500
          ? `GRIDGO could not ${verb} just now. Try again in a moment.`
          : `GRIDGO would not ${verb}. Pull down to refresh, then try again.`,
    };
  }
  return {
    status: "failed",
    message: `Cannot reach GRIDGO from this device, so nothing was changed. Check the connection and try again.`,
  };
}

export async function markRead(id: string): Promise<AlertWriteOutcome> {
  try {
    await api.markNotificationRead(id);
    return { status: "saved" };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return failure(error, "mark that read");
  }
}

/**
 * Mark exactly these read.
 *
 * The caller passes the ids it can actually see. An alert that arrives while
 * the shop is looking at the screen is not one it has read, and marking it
 * would hide something it has never been shown.
 */
export async function markAllRead(ids: string[]): Promise<AlertWriteOutcome> {
  if (!ids.length) return { status: "saved" };
  try {
    await api.markNotificationsRead(ids);
    return { status: "saved" };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return failure(error, "mark those read");
  }
}

export async function remove(id: string): Promise<AlertWriteOutcome> {
  try {
    await api.deleteNotification(id);
    return { status: "saved" };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return failure(error, "delete that alert");
  }
}

/**
 * What the screen says about where a change actually lives.
 *
 * `null` once the platform is doing the work — at which point the sentence,
 * and the device-local store behind it, should both go.
 */
export function localOnlyCaveat(anyLocal: boolean): string | null {
  return anyLocal
    ? "Alerts you clear or delete are cleared on this phone. GRIDGO does not carry that to your other devices yet."
    : null;
}
