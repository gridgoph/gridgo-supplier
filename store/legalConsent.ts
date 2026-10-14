import { create } from "zustand";

import * as api from "@/lib/api";
import type { LegalVersion } from "@/lib/api";
import {
  type LegalGateStatus,
  isLegalUnsupported,
  isLegalVersionChanged,
  LEGAL_VERSION_CHANGED,
} from "@/lib/legal";
import { legalContext } from "@/lib/legalContext";

/**
 * Whether the signed-in shop still has terms to agree to
 * (`GET /me/legal/pending`), read on every sign-in and every return to the app.
 * An invited shop and one Operations provisioned meet it on their first
 * sign-in; every shop meets it again after a material change.
 *
 * - `unknown` — not read yet for this account. Launch waits on it rather than
 *   painting Home and then snatching it away.
 * - `blocked` — a document is waiting. Ordinary navigation is closed and the
 *   agreement screen is the only way on; legal text, privacy requests and
 *   sign-out stay open.
 * - `clear` — nothing waiting, or the read failed. A failed read lets the
 *   shop in and asks again on the next return: an outage must never lock a
 *   shop out of the jobs it is in the middle of.
 */
export type { LegalGateStatus };

type LegalConsentState = {
  userId: string | null;
  status: LegalGateStatus;
  pending: LegalVersion[];
  notices: LegalVersion[];
  accepting: boolean;
  error: string | null;
  /** Never throws. */
  load: (userId: string) => Promise<void>;
  /** Agree to exactly the versions on screen. True when nothing is left. */
  accept: (versionIds: string[]) => Promise<boolean>;
  reset: () => void;
};

const initial = {
  userId: null,
  status: "unknown" as LegalGateStatus,
  pending: [] as LegalVersion[],
  notices: [] as LegalVersion[],
  accepting: false,
  error: null,
};

let inflight: { userId: string; promise: Promise<void> } | null = null;

/**
 * How long a first read may hold the launch. Past it the shop goes in, and a
 * late "blocked" answer still closes the app behind them.
 */
export const LEGAL_FIRST_READ_MS = 5_000;

export const useLegalConsent = create<LegalConsentState>((set, get) => ({
  ...initial,

  load: (userId) => {
    if (inflight?.userId === userId) return inflight.promise;
    // A different account starts from nothing: another person's answer must
    // never open, or close, this one's app.
    if (get().userId !== userId) set({ ...initial, userId });
    const failOpen = setTimeout(() => {
      if (get().userId === userId && get().status === "unknown") set({ status: "clear" });
    }, LEGAL_FIRST_READ_MS);
    const promise = (async () => {
      try {
        const answer = await api.getLegalPending();
        if (get().userId !== userId) return;
        const pending = answer.pending ?? [];
        set({
          status: answer.blocking && pending.length ? "blocked" : "clear",
          pending,
          notices: answer.notices ?? [],
        });
      } catch (error) {
        if (get().userId !== userId) return;
        if (isLegalUnsupported(error)) {
          set({ status: "clear", pending: [], notices: [] });
          return;
        }
        // Keep a known answer; only an unanswered first read fails open.
        if (get().status === "unknown") set({ status: "clear" });
      } finally {
        clearTimeout(failOpen);
        if (inflight?.userId === userId) inflight = null;
      }
    })();
    inflight = { userId, promise };
    return promise;
  },

  accept: async (versionIds) => {
    const { pending, accepting, userId } = get();
    if (accepting || !userId || pending.length === 0) return pending.length === 0;
    // The tick was given to these versions. If the list moved under it, the
    // screen draws the box again unticked rather than agreeing to the new one.
    const onScreen = pending.map((doc) => doc.id);
    if (versionIds.join("|") !== onScreen.join("|")) return false;
    set({ accepting: true, error: null });
    try {
      const answer = await api.acceptLegalVersions(versionIds, await legalContext());
      if (get().userId !== userId) return false;
      const left = answer.pending ?? [];
      set({
        status: answer.blocking && left.length ? "blocked" : "clear",
        pending: left,
        notices: answer.notices ?? [],
      });
      return left.length === 0;
    } catch (error) {
      if (isLegalVersionChanged(error)) {
        // Fetch the new text and ask again; never agree on the shop's behalf.
        set({ error: LEGAL_VERSION_CHANGED });
        await get().load(userId);
        return false;
      }
      set({
        error:
          "Your agreement did not reach GRIDGO. Check this phone's connection and try again.",
      });
      return false;
    } finally {
      set({ accepting: false });
    }
  },

  reset: () => {
    inflight = null;
    set(initial);
  },
}));

/** The gate as the landing ladder reads it: only this account's answer counts. */
export function legalGateFor(
  state: Pick<LegalConsentState, "userId" | "status">,
  userId: string | null | undefined,
): LegalGateStatus {
  if (!userId || state.userId !== userId) return "unknown";
  return state.status;
}
