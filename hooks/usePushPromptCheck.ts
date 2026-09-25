import { router, usePathname } from "expo-router";
import { useEffect } from "react";

import { PUSH_PROMPT_LANDING, shouldOfferPushPrompt } from "@/lib/pushPrompt";
import { usePush } from "@/store/push";
import { markPushPromptOffered, usePushPrompt } from "@/store/pushPrompt";
import { isSignedIn, useSession } from "@/store/session";
import { afterNativePresentation } from "@/store/sheets";

/**
 * Opens `app/push-prompt.tsx` when `lib/pushPrompt.ts` says it is time: a
 * signed-in shop on Home whose phone has not granted notifications, and no
 * explainer in the last week.
 *
 * `ready` is the root layout's word that the opening has finished, the session
 * has settled, and no update sheet is waiting — one sheet at a time, and the
 * stack is re-keyed when a restored session arrives, which would take a sheet
 * pushed earlier down with it.
 */
export function usePushPromptCheck(ready: boolean): void {
  const pathname = usePathname();
  const signedIn = isSignedIn(useSession((s) => s.user));
  const supported = usePush((s) => s.supported);
  const permission = usePush((s) => s.permission);
  const hydrated = usePushPrompt((s) => s.hydrated);
  const sheetOpen = usePushPrompt((s) => s.sheetOpen);
  const lastOfferedAt = usePushPrompt((s) => s.lastOfferedAt);
  const onLanding = pathname === PUSH_PROMPT_LANDING;

  useEffect(() => {
    if (!ready || !hydrated || sheetOpen) return;
    const due = () =>
      shouldOfferPushPrompt({
        supported: usePush.getState().supported,
        signedIn: isSignedIn(useSession.getState().user),
        permission: usePush.getState().permission,
        onLanding,
        lastOfferedAt: usePushPrompt.getState().lastOfferedAt,
        now: Date.now(),
      });
    if (!due()) return;
    let cancelled = false;
    // Let whatever was last presented finish leaving first.
    void afterNativePresentation().then(() => {
      if (cancelled || usePushPrompt.getState().sheetOpen || !due()) return;
      markPushPromptOffered();
      router.push("/push-prompt");
    });
    return () => {
      cancelled = true;
    };
  }, [ready, hydrated, sheetOpen, signedIn, supported, permission, onLanding, lastOfferedAt]);
}
