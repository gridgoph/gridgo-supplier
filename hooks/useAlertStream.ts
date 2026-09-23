import { useEffect } from "react";
import { AppState } from "react-native";
import { openAlertStream, type AlertStreamHandle } from "@/lib/alertStream";
import { invalidate, liveGeneration, subscribeLive } from "@/lib/live";
import { useSession } from "@/store/session";
import { useAlertsStore } from "@/store/alerts";
import { playProductionNudgeSting } from "@/lib/nudgeSound";
import { shouldToast, useToasts, useViewing } from "@/store/toasts";

/**
 * Foreground reconciliation for one signed-in supplier. Resource hints trigger
 * fresh reads; they never carry domain state or grant access. Reconnect/resume
 * reconciles all resources, and an unavailable stream falls back to a read
 * every 30 seconds while foregrounded. Backgrounding closes the connection.
 * Only newly dated, unseen notifications may toast; replay still refreshes data.
 */
export function useAlertStream(enabled = true): void {
  const userId = useSession((s) => s.user?.id ?? null);
  const verification = useSession((s) => s.user?.verificationStatus);
  useEffect(() => {
    if (!enabled || !userId) return;
    const generation = liveGeneration();
    const startedAt = Date.now();
    let stopped = false;
    let foreground = AppState.currentState !== "background" && AppState.currentState !== "inactive";
    let live = false;
    let handle: AlertStreamHandle | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let refreshing = false;
    const pending = new Set<string>();
    const seen = new Set<string>();
    const current = () => !stopped && generation === liveGeneration();
    async function flush() {
      timer = null;
      if (!current() || !foreground || refreshing) return;
      refreshing = true;
      const resources = new Set(pending); pending.clear();
      try {
        if (resources.has("*") || resources.has("identity") || resources.has("approvals")) {
          await useSession.getState().refresh();
        }
        if (!current()) return;

        if (resources.has("*") || resources.has("notifications")) {
          try { await useAlertsStore.getState().refresh(); } catch { /* Next live event/resume or fallback catches up. */ }
        }
      } finally {
        refreshing = false;
        if (pending.size && current() && foreground) timer = setTimeout(() => void flush(), 80);
      }
    }
    const unsubscribe = subscribeLive((resource) => {
      pending.add(resource);
      if (!timer && !refreshing) timer = setTimeout(() => void flush(), 80);
    });
    function start() {
      if (!current()) return;
      handle?.close();
      // Even offline startup must load data and retry; no inbox preflight can block the transport.
      invalidate("*");
      handle = openAlertStream({
        onStatus: (connected) => {
          if (!current()) return;
          live = connected;
          if (connected) invalidate("*");
        },
        onResumeUnavailable: () => { if (current()) invalidate("*"); },
        onInvalidate: (event) => { if (current()) invalidate(event.resource); },
        onNotification: (notification) => {
          if (!current() || (notification.userId && notification.userId !== userId)) return;
          invalidate("*");
          if (seen.has(notification.id)) return;
          seen.add(notification.id);
          if (seen.size > 500) seen.delete(seen.values().next().value as string);
          const toasting = Date.parse(notification.at) >= startedAt && shouldToast(notification, useViewing.getState(), useAlertsStore.getState().dismissed);
          if (toasting) {
            useToasts.getState().show({id:notification.id,title:notification.title,body:notification.body,orderId:notification.orderId});
          }
          playProductionNudgeSting({ type: notification.type, id: notification.id, toasting });
        },
      });
    }
    if (foreground) start();
    const appState = AppState.addEventListener("change", (next) => {
      foreground = next === "active";
      if (!foreground) { live = false; handle?.close(); handle = null; }
      else start();
    });
    // Resilience for unsupported streams, network errors and unavailable native push.
    const fallback = setInterval(() => { if (foreground && !live && current()) invalidate("*"); }, 30_000);
    return () => {
      stopped = true; handle?.close(); appState.remove(); unsubscribe(); clearInterval(fallback);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, userId, verification]);
}
