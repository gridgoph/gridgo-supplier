import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/**
 * Editorial notices this phone has already shown, per account.
 *
 * gridgo-api leaves remembering a notice to the app ("may remember its
 * version locally"); nothing is recorded server-side for reading one.
 */

const MAX_SEEN = 60;

type LegalNoticesState = {
  seen: Record<string, string[]>;
  hydrated: boolean;
  markSeen: (userId: string, versionIds: readonly string[]) => void;
};

export const useLegalNotices = create<LegalNoticesState>()(
  persist(
    (set, get) => ({
      seen: {},
      hydrated: false,
      markSeen: (userId, versionIds) => {
        if (!versionIds.length) return;
        const mine = get().seen[userId] ?? [];
        const next = [...mine, ...versionIds.filter((id) => !mine.includes(id))].slice(-MAX_SEEN);
        set({ seen: { ...get().seen, [userId]: next } });
      },
    }),
    {
      name: "gridgo.supplier.legalNotices.v1",
      storage: createPersistStorage<LegalNoticesState>(),
      partialize: (state) => ({ seen: state.seen }) as LegalNoticesState,
      onRehydrateStorage: () => () => useLegalNotices.setState({ hydrated: true }),
    },
  ),
);
