import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  completedUpdate,
  fetchLatestRelease,
  shouldCheck,
  shouldOffer,
  type Build,
  type LatestRelease,
  type Snooze,
} from "@/lib/appUpdate";
import { toDayKey } from "@/lib/day";
import { createPersistStorage } from "@/lib/persistStorage";

/**
 * The update offer and the "update completed" note, per device.
 *
 * Not account-scoped: the APK on the phone is the same whoever is signed in,
 * and a shop that never signs in still needs to hear there is a new version.
 * The rules live in `lib/appUpdate.ts`; this only remembers what they need
 * across launches — the last build this phone ran, and a "Later".
 */

export type UpdateOffer = {
  installed: Build;
  latest: LatestRelease;
};

type AppUpdateState = {
  /** The versionCode the previous launch ran. Persisted. */
  lastSeenVersionCode: number | null;
  /** "Later" on an offer. Persisted. */
  snooze: Snooze | null;

  hydrated: boolean;
  /** When GitHub was last asked, this run. */
  lastCheckedAt: number | null;
  offer: UpdateOffer | null;
  /** Set on the first launch of a newer build than the previous one. */
  completed: Build | null;
  /** True while the sheet route is on screen, so it is never pushed twice. */
  sheetOpen: boolean;
};

type Persisted = Pick<AppUpdateState, "lastSeenVersionCode" | "snooze">;

export const useAppUpdate = create<AppUpdateState>()(
  persist(
    (): AppUpdateState => ({
      lastSeenVersionCode: null,
      snooze: null,
      hydrated: false,
      lastCheckedAt: null,
      offer: null,
      completed: null,
      sheetOpen: false,
    }),
    {
      name: "gridgo.supplier.appUpdate",
      storage: createPersistStorage<Persisted>(),
      partialize: (state): Persisted => ({
        lastSeenVersionCode: state.lastSeenVersionCode,
        snooze: state.snooze,
      }),
      onRehydrateStorage: () => () => {
        useAppUpdate.setState({ hydrated: true });
      },
    },
  ),
);

/** Resolves once the persisted half has been read back. */
export function appUpdateHydrated(): Promise<void> {
  if (useAppUpdate.getState().hydrated) return Promise.resolve();
  return new Promise((resolve) => {
    const unsubscribe = useAppUpdate.subscribe((state) => {
      if (!state.hydrated) return;
      unsubscribe();
      resolve();
    });
  });
}

/**
 * Once per launch: note which build this is, and if it is newer than the one
 * the phone ran last time, queue the one-time "Update completed".
 */
export function recordLaunch(installed: Build): void {
  const { lastSeenVersionCode } = useAppUpdate.getState();
  useAppUpdate.setState({
    lastSeenVersionCode: installed.versionCode,
    completed: completedUpdate(lastSeenVersionCode, installed) ? installed : null,
  });
}

/** Ask GitHub, and queue the offer when there is a newer build worth offering. */
export async function checkForUpdate(
  installed: Build,
  reason: "launch" | "foreground",
  now: Date = new Date(),
  fetchLatest: () => Promise<LatestRelease | null> = () => fetchLatestRelease(),
): Promise<void> {
  if (!shouldCheck(reason, useAppUpdate.getState().lastCheckedAt, now.getTime())) return;
  useAppUpdate.setState({ lastCheckedAt: now.getTime() });

  const latest = await fetchLatest();
  if (!latest) return;

  const { snooze, offer } = useAppUpdate.getState();
  if (!shouldOffer(installed, latest, snooze, toDayKey(now))) return;
  // The same offer already waiting — leave it, so the sheet is not re-pushed.
  if (offer?.latest.versionCode === latest.versionCode) return;
  useAppUpdate.setState({ offer: { installed, latest } });
}

/** "Later", or the sheet dragged away: quiet for this version until tomorrow. */
export function snoozeOffer(now: Date = new Date()): void {
  const { offer } = useAppUpdate.getState();
  if (!offer) return;
  useAppUpdate.setState({
    offer: null,
    snooze: { versionCode: offer.latest.versionCode, dayKey: toDayKey(now) },
  });
}

/**
 * "Update now" handed the download to Android. Not a snooze: a shop that
 * comes back without installing is asked again at the next check.
 */
export function takeOffer(): void {
  useAppUpdate.setState({ offer: null });
}

export function dismissCompleted(): void {
  useAppUpdate.setState({ completed: null });
}

export function setUpdateSheetOpen(open: boolean): void {
  useAppUpdate.setState({ sheetOpen: open });
}

/** What the sheet was showing when it opened. */
export type UpdateSheetSubject =
  | { kind: "completed" }
  | { kind: "offer"; versionCode: number };

/**
 * The sheet has left, by its own buttons or any way the platform allows. Only
 * the thing it was showing is settled: the completion note has been seen, and
 * an offer left unanswered — dragged away, backed out of — counts as "Later".
 * An offer queued behind the completion note is left for its own turn.
 */
export function closeUpdateSheet(subject: UpdateSheetSubject | null, now: Date = new Date()): void {
  const { offer } = useAppUpdate.getState();
  if (subject?.kind === "completed") dismissCompleted();
  if (subject?.kind === "offer" && offer?.latest.versionCode === subject.versionCode) {
    snoozeOffer(now);
  }
  setUpdateSheetOpen(false);
}
