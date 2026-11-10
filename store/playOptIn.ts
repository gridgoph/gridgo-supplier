import { Linking, Platform } from "react-native";
import { create } from "zustand";

import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { buildDistribution } from "@/lib/buildDistribution";
import { optInInstall, type OptInProgress } from "@/lib/playOptIn";

/**
 * This install, as every opt-in call reports it. A development web build may
 * walk the Android path (`EXPO_PUBLIC_PLAY_OPTIN_FORCE_ANDROID=1`); a release
 * ignores the switch, read as the literal so Babel can inline it.
 */
export function playOptInInstall(): api.PlayOptInInstall {
  const force = typeof __DEV__ !== "undefined" && __DEV__ && process.env.EXPO_PUBLIC_PLAY_OPTIN_FORCE_ANDROID === "1";
  return optInInstall(Platform.OS, buildDistribution(), force);
}

const NO_PROGRESS: OptInProgress = { groupOpened: false, optInOpened: false };

type PlayOptInStore = {
  /** The account the answer below belongs to. */
  owner: string | null;
  state: api.PlayOptInState | null;
  /** Why the last read failed, for the flow screen; Home stays silent. */
  loadError: string | null;
  /** Closed on Home this app session: the card waits for the next launch. */
  closed: boolean;
  /** `shown` already sent this app session. */
  shownSent: boolean;
  progress: OptInProgress;
  load: (userId: string | null) => Promise<void>;
  shown: () => void;
  tapped: () => void;
  dismiss: () => void;
  confirmGmail: (email: string, googleAccount: boolean) => Promise<string | null>;
  openGroup: () => Promise<string | null>;
  openOptIn: () => Promise<string | null>;
  openPlayStore: () => Promise<void>;
  reset: () => void;
};

let sequence = 0;

function report(type: api.PlayOptInEvent): Promise<void> {
  return api.reportPlayOptInEvent(playOptInInstall(), type);
}

async function open(url: string | null | undefined): Promise<void> {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    // Nothing on this phone can open it; the step stays offered.
  }
}

/**
 * The Play opt-in for the signed-in shop, in memory only: GRIDGO holds the
 * Gmail, the steps and the close count, so a new launch asks it again rather
 * than trusting anything this phone kept (`docs/PLAY_OPTIN_API.md`).
 */
export const usePlayOptIn = create<PlayOptInStore>()((set, get) => ({
  owner: null,
  state: null,
  loadError: null,
  closed: false,
  shownSent: false,
  progress: NO_PROGRESS,
  load: async (userId) => {
    if (!userId) {
      get().reset();
      return;
    }
    const mine = ++sequence;
    if (get().owner !== userId) {
      set({ owner: userId, state: null, loadError: null, closed: false, shownSent: false, progress: NO_PROGRESS });
    }
    try {
      const state = await api.getPlayOptIn(playOptInInstall());
      if (mine !== sequence) return;
      set({ state, loadError: null });
    } catch (error) {
      if (mine !== sequence) return;
      set({ loadError: humanizeApiError(error, offlineMessage("open the tester steps")) });
    }
  },
  shown: () => {
    if (get().shownSent || !get().owner) return;
    set({ shownSent: true });
    void report("shown").catch(() => undefined);
  },
  tapped: () => {
    if (!get().owner) return;
    void report("tapped").catch(() => undefined);
  },
  dismiss: () => {
    const state = get().state;
    set({
      closed: true,
      state: state ? { ...state, dismissCount: state.dismissCount + 1 } : state,
    });
    // Counted once per call by GRIDGO, so it is sent once and never retried.
    void report("dismissed").catch(() => undefined);
  },
  confirmGmail: async (email, googleAccount) => {
    try {
      const state = await api.confirmPlayOptInGmail(playOptInInstall(), email.trim(), googleAccount);
      // A new address clears the link steps on GRIDGO; it does here too.
      set({ state, progress: NO_PROGRESS });
      return null;
    } catch (error) {
      return humanizeApiError(error, offlineMessage("confirm your Gmail"));
    }
  },
  openGroup: async () => {
    const url = get().state?.groupJoinUrl;
    try {
      await report("group_opened");
    } catch (error) {
      return humanizeApiError(error, offlineMessage("open the tester group"));
    }
    set({ progress: { ...get().progress, groupOpened: true } });
    await open(url);
    return null;
  },
  openOptIn: async () => {
    const url = get().state?.optInUrl;
    try {
      await report("optin_opened");
    } catch (error) {
      return humanizeApiError(error, offlineMessage("open Google Play"));
    }
    set({ progress: { ...get().progress, optInOpened: true } });
    await open(url);
    return null;
  },
  openPlayStore: async () => {
    await open(get().state?.playStoreUrl);
  },
  reset: () => {
    sequence++;
    set({ owner: null, state: null, loadError: null, closed: false, shownSent: false, progress: NO_PROGRESS });
  },
}));
