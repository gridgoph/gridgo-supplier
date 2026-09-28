import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";
import {
  arriveAt,
  backStep,
  completeStep,
  nextStep,
  shouldAutoStart,
  skipTour,
  startTour,
  type TourProgress,
  type TourRect,
  type TourScreen,
  type TourStepId,
} from "@/lib/tour";

const STORAGE_KEY = "gridgo.supplier.tour.v1";

type TourStore = {
  hydrated: boolean;
  /**
   * One record per account that has signed in on this phone. Persisted.
   * Per account because a counter phone's second shop is a new shop too; per
   * phone because the flag is local storage, not GRIDGO's.
   */
  progress: Record<string, TourProgress>;
  /** The tour screen in focus right now, if any. In memory only. */
  screen: TourScreen | null;
  /** Which focus owns `screen`, so a late blur cannot clear a newer focus. */
  focusToken: number;
  /** Where the lit control is, in window pixels. In memory only. */
  rects: Partial<Record<TourStepId, TourRect>>;
  /**
   * The step whose screen has finished arriving, so its card may be drawn.
   * In memory only; a store rather than component state because the overlay
   * sets it from a timer.
   */
  settled: TourStepId | null;

  /** The first-time start. Does nothing once a tour is on record. */
  autoStart: (accountId: string, firstTime: boolean) => void;
  /** Account → Replay the tour. Always starts from the first step. */
  replay: (accountId: string) => void;
  next: (accountId: string) => void;
  back: (accountId: string) => void;
  skip: (accountId: string) => void;
  /** The shop used the lit control itself; move past that step. */
  complete: (accountId: string, id: TourStepId) => void;
  /** A tour screen came into focus. Returns the token its blur must hand back. */
  arrive: (accountId: string | null, screen: TourScreen) => number;
  leave: (token: number) => void;
  setRect: (id: TourStepId, rect: TourRect) => void;
  clearRect: (id: TourStepId) => void;
  settle: (id: TourStepId | null) => void;
  reset: () => void;
};

function withProgress(
  state: TourStore,
  accountId: string,
  change: (progress: TourProgress) => TourProgress,
): Partial<TourStore> {
  const progress = state.progress[accountId];
  if (!progress) return {};
  const changed = change(progress);
  return changed === progress ? {} : { progress: { ...state.progress, [accountId]: changed } };
}

/**
 * The first-run tour's memory. Rules live in `lib/tour.ts`; this store only
 * keeps them per account and says which screen is up.
 */
export const useTour = create<TourStore>()(
  persist(
    (set, get) => ({
      hydrated: false,
      progress: {},
      screen: null,
      focusToken: 0,
      rects: {},
      settled: null,

      autoStart: (accountId, firstTime) => {
        const state = get();
        if (!state.hydrated || !shouldAutoStart(state.progress[accountId], firstTime)) return;
        set({ progress: { ...state.progress, [accountId]: startTour() } });
      },
      replay: (accountId) =>
        set((state) => ({ progress: { ...state.progress, [accountId]: startTour() } })),
      next: (accountId) => set((state) => withProgress(state, accountId, nextStep)),
      back: (accountId) => set((state) => withProgress(state, accountId, backStep)),
      skip: (accountId) => set((state) => withProgress(state, accountId, skipTour)),
      complete: (accountId, id) =>
        set((state) => withProgress(state, accountId, (p) => completeStep(p, id))),
      arrive: (accountId, screen) => {
        const token = get().focusToken + 1;
        set((state) => ({
          screen,
          focusToken: token,
          ...(accountId ? withProgress(state, accountId, (p) => arriveAt(p, screen)) : {}),
        }));
        return token;
      },
      leave: (token) => {
        if (get().focusToken === token) set({ screen: null });
      },
      setRect: (id, rect) => {
        const held = get().rects[id];
        if (
          held &&
          held.x === rect.x &&
          held.y === rect.y &&
          held.width === rect.width &&
          held.height === rect.height
        ) {
          return;
        }
        set((state) => ({ rects: { ...state.rects, [id]: rect } }));
      },
      clearRect: (id) =>
        set((state) => {
          if (!state.rects[id]) return {};
          const rects = { ...state.rects };
          delete rects[id];
          return { rects };
        }),
      settle: (id) => set({ settled: id }),
      reset: () => set({ progress: {}, screen: null, rects: {}, settled: null }),
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage(),
      partialize: (state) => ({ progress: state.progress }),
      onRehydrateStorage: () => () => {
        useTour.setState({ hydrated: true });
      },
    },
  ),
);
