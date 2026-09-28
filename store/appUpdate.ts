import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  completedUpdate,
  describeOffer,
  fetchLatestRelease,
  shouldCheck,
  shouldOffer,
  type Build,
  type LatestRelease,
  type ReleaseRead,
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

/**
 * Every decision the check makes, in a development build's Metro log, so a
 * prompt that does not appear says why instead of failing silently. A release
 * build logs nothing: an update check that finds nothing is not news.
 */
export function logUpdateCheck(line: string): void {
  if (__DEV__) console.info(`[update-check] ${line}`);
}

export type UpdateOffer = {
  installed: Build;
  latest: LatestRelease;
};

/** The local "Updated to version X" card in Alerts, kept until the shop dismisses it. */
export type UpdatedNotice = { build: Build; at: number };

type AppUpdateState = {
  /** The versionCode the previous launch ran. Persisted. */
  lastSeenVersionCode: number | null;
  /** "Later" on an offer. Persisted. */
  snooze: Snooze | null;
  /**
   * The newest release GitHub named, with its What's new. Persisted, so the
   * Alerts card still knows the phone is behind on a launch with no network.
   * Unlike `offer`, "Later" does not clear it: the card stays while the phone
   * is behind, and only the sheet steps aside.
   */
  latest: LatestRelease | null;
  /** Set once, on the first launch of a newer build. Persisted. */
  updatedNotice: UpdatedNotice | null;
  /** This launch's build; `null` where the check does not run (dev, Expo Go). */
  installed: Build | null;

  hydrated: boolean;
  /**
   * When GitHub last answered, this run. Not persisted: a cold launch always
   * reads, and the interval only spaces out returns to the foreground.
   */
  lastCheckedAt: number | null;
  /** A read is in flight; a foreground return during it does not start another. */
  checking: boolean;
  offer: UpdateOffer | null;
  /** Set on the first launch of a newer build than the previous one. */
  completed: Build | null;
  /** True while the sheet route is on screen, so it is never pushed twice. */
  sheetOpen: boolean;
};

type Persisted = Pick<
  AppUpdateState,
  "lastSeenVersionCode" | "snooze" | "latest" | "updatedNotice"
>;

export const useAppUpdate = create<AppUpdateState>()(
  persist(
    (): AppUpdateState => ({
      lastSeenVersionCode: null,
      snooze: null,
      latest: null,
      updatedNotice: null,
      installed: null,
      hydrated: false,
      lastCheckedAt: null,
      checking: false,
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
        latest: state.latest,
        updatedNotice: state.updatedNotice,
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
export function recordLaunch(installed: Build, now: number = Date.now()): void {
  const { lastSeenVersionCode, updatedNotice } = useAppUpdate.getState();
  const upgraded = completedUpdate(lastSeenVersionCode, installed);
  useAppUpdate.setState({
    installed,
    lastSeenVersionCode: installed.versionCode,
    completed: upgraded ? installed : null,
    updatedNotice: upgraded ? { build: installed, at: now } : updatedNotice,
  });
}

/**
 * The newer release waiting for this phone, or `null`. Drives the Alerts card,
 * which stays after "Later" — the sheet steps aside, the fact does not.
 */
export function selectAvailableUpdate(
  state: Pick<AppUpdateState, "installed" | "latest">,
): LatestRelease | null {
  const { installed, latest } = state;
  if (!installed || !latest) return null;
  return latest.versionCode > installed.versionCode ? latest : null;
}

/**
 * The "Updated to" card, only while this phone still runs that build: a
 * notice about a build it has moved on from would be a lie.
 */
export function selectUpdatedNotice(
  state: Pick<AppUpdateState, "installed" | "updatedNotice">,
): UpdatedNotice | null {
  const { installed, updatedNotice } = state;
  if (!installed || !updatedNotice) return null;
  return updatedNotice.build.versionCode === installed.versionCode ? updatedNotice : null;
}

export function dismissUpdatedNotice(): void {
  useAppUpdate.setState({ updatedNotice: null });
}

/** Ask GitHub, and queue the offer when there is a newer build worth offering. */
export async function checkForUpdate(
  installed: Build,
  reason: "launch" | "foreground",
  now: Date = new Date(),
  fetchLatest: () => Promise<ReleaseRead> = () => fetchLatestRelease(),
): Promise<void> {
  const { checking, lastCheckedAt } = useAppUpdate.getState();
  if (checking) return;
  if (!shouldCheck(reason, lastCheckedAt, now.getTime())) {
    logUpdateCheck("skipped: GitHub was read less than 4 hours ago");
    return;
  }
  useAppUpdate.setState({ checking: true });

  let latest: LatestRelease | null;
  try {
    const read = await fetchLatest();
    logUpdateCheck(read.detail);
    // Only a read GitHub answered starts the interval. Offline or timed out,
    // the next return to the foreground asks again.
    if (read.answered) useAppUpdate.setState({ lastCheckedAt: now.getTime() });
    latest = read.latest;
  } finally {
    useAppUpdate.setState({ checking: false });
  }
  if (!latest) return;
  useAppUpdate.setState({ latest });

  const { snooze, offer } = useAppUpdate.getState();
  const today = toDayKey(now);
  logUpdateCheck(describeOffer(installed, latest, snooze, today));
  if (!shouldOffer(installed, latest, snooze, today)) return;
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
 *
 * `byShop: false` is the navigator taking the sheet down on its own — the root
 * stack is re-keyed when a session arrives or leaves. Nobody answered, so
 * nothing is settled and the sheet comes back on the new stack; counting that
 * as "Later" would hide the offer for the rest of the day, unseen.
 */
export function closeUpdateSheet(
  subject: UpdateSheetSubject | null,
  now: Date = new Date(),
  byShop: boolean = true,
): void {
  if (!byShop) {
    logUpdateCheck("the sheet was taken down with the stack; it will be shown again");
    setUpdateSheetOpen(false);
    return;
  }
  const { offer } = useAppUpdate.getState();
  if (subject?.kind === "completed") dismissCompleted();
  if (subject?.kind === "offer" && offer?.latest.versionCode === subject.versionCode) {
    snoozeOffer(now);
  }
  setUpdateSheetOpen(false);
}
