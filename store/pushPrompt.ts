import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/**
 * When the notifications explainer last opened on this phone.
 *
 * Per device, not per account: permission belongs to the phone, and a second
 * shop signing in on it has already been asked. The rules live in
 * `lib/pushPrompt.ts`; this remembers only what they need across launches.
 */
type PushPromptState = {
  /** Epoch ms of the last time the explainer opened. Persisted. */
  lastOfferedAt: number | null;
  hydrated: boolean;
  /** True while the sheet is on screen, so it is never pushed twice. */
  sheetOpen: boolean;
};

type Persisted = Pick<PushPromptState, "lastOfferedAt">;

export const usePushPrompt = create<PushPromptState>()(
  persist(
    (): PushPromptState => ({ lastOfferedAt: null, hydrated: false, sheetOpen: false }),
    {
      name: "gridgo.supplier.pushPrompt",
      storage: createPersistStorage<Persisted>(),
      partialize: (state): Persisted => ({ lastOfferedAt: state.lastOfferedAt }),
      onRehydrateStorage: () => () => {
        usePushPrompt.setState({ hydrated: true });
      },
    },
  ),
);

/**
 * The explainer is opening. Recorded now rather than on an answer, so every way
 * out — "Not now", a drag, the back gesture, the app being killed — starts the
 * same week-long wait.
 */
export function markPushPromptOffered(now: number = Date.now()): void {
  usePushPrompt.setState({ lastOfferedAt: now, sheetOpen: true });
}

export function closePushPrompt(): void {
  usePushPrompt.setState({ sheetOpen: false });
}
