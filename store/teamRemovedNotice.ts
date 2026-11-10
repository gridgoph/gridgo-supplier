import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/**
 * "You are off the team", kept until the person signs in again.
 *
 * Removal ends the Clerk session, and ending it can restart the app (Clerk
 * reloads the page on the web; a phone may be closed before Sign in is ever
 * drawn). Without this, the next launch shows a plain door and the person is
 * left guessing why they were signed out. Holds no account detail — only that
 * the last person on this phone was removed.
 */
type TeamRemovedNoticeState = {
  pending: boolean;
  mark: () => void;
  clear: () => void;
};

export const useTeamRemovedNotice = create<TeamRemovedNoticeState>()(
  persist(
    (set) => ({
      pending: false,
      mark: () => set({ pending: true }),
      clear: () => set({ pending: false }),
    }),
    {
      name: "gridgo.supplier.teamRemovedNotice",
      storage: createPersistStorage<TeamRemovedNoticeState>(),
      partialize: (state) => ({ pending: state.pending }) as TeamRemovedNoticeState,
    },
  ),
);
