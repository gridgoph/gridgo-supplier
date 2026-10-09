import { router, useRootNavigationState } from "expo-router";
import { useEffect } from "react";

import { liveGeneration, subscribeLive } from "@/lib/live";
import { callHref } from "@/lib/orderCall";
import { useCall } from "@/store/call";
import { useSession } from "@/store/session";

/**
 * Put the call screen up when a rider's call starts ringing on this phone,
 * over whatever the shop was looking at. Finding the call is `store/call.ts`'s
 * job; this only presents it, once per call, and only while the navigator can
 * take a push. A changed account drops any call the previous one had.
 */
export function useIncomingCallScreen(enabled: boolean): void {
  const navigationReady = Boolean(useRootNavigationState()?.key);
  const userId = useSession((s) => s.user?.id ?? null);
  // Plain values only: a selector that builds an object re-renders the root stack forever.
  const ringing = useCall((s) => s.snapshot?.phase === "incoming");
  const incomingCallId = useCall((s) => (ringing ? (s.snapshot?.call?.id ?? null) : null));
  const incomingOrderId = useCall((s) => (ringing ? (s.snapshot?.orderId ?? null) : null));
  const screenOpen = useCall((s) => s.screenOpen);

  useEffect(() => {
    if (!enabled || !navigationReady || !incomingCallId || !incomingOrderId || screenOpen) return;
    if (useCall.getState().presented === incomingCallId) return;
    useCall.getState().markPresented(incomingCallId);
    router.push(callHref({ orderId: incomingOrderId, mode: "incoming" }));
  }, [enabled, navigationReady, incomingCallId, incomingOrderId, screenOpen]);

  // Another account on this phone never inherits a call, ringing or live.
  useEffect(() => {
    let generation = liveGeneration();
    return subscribeLive(() => {
      if (generation === liveGeneration()) return;
      generation = liveGeneration();
      useCall.getState().reset();
    });
  }, []);
  useEffect(() => {
    if (!userId) useCall.getState().reset();
  }, [userId]);
}
