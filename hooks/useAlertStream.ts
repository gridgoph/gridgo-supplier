import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

import { listNotificationInbox } from "@/lib/api";
import { openAlertStream, type AlertStreamHandle } from "@/lib/alertStream";
import { useAlertsStore } from "@/store/alerts";
import { shouldToast, useToasts, useViewing } from "@/store/toasts";

/**
 * Keep the live alert stream open while the shop is signed in.
 *
 * Three things happen when an alert arrives: the badge moves immediately, a
 * toast appears if the shop is not already looking at the thing it is about,
 * and that is all — the alert itself is fetched with everything else the next
 * time a list loads, so nothing here has to keep a second copy of the list.
 *
 * Opening with no cursor makes the server replay the whole inbox. Refresh then
 * looks like two brand-new banners for alerts the shop already saw. The list
 * snapshot (or the last id this phone persisted) is sent as `Last-Event-ID`
 * so only alerts appended after that interrupt.
 *
 * When the app has been in the background the socket is usually dead and the
 * OS has not told anyone, so coming back to the foreground reconnects. The
 * stream resumes from the last id it saw, which is what stops a shop missing
 * the job it was offered while the phone was in a pocket.
 *
 * If the stream cannot open, nothing is shown. Every screen already reloads on
 * focus, so the app is merely back to what it did before — and "cannot reach
 * the event stream" is not something a shop can do anything about.
 */
export function useAlertStream(enabled: boolean): void {
  const handle = useRef<AlertStreamHandle | null>(null);

  useEffect(() => {
    if (!enabled) {
      handle.current?.close();
      handle.current = null;
      return;
    }

    let cancelled = false;

    async function start() {
      let resume = useAlertsStore.getState().streamCursor;
      if (!resume) {
        let inbox: { snapshot: string | null };
        try {
          inbox = await listNotificationInbox();
        } catch {
          // Opening with no cursor makes the server replay the inbox as live
          // toasts. Wait until a list can give us a snapshot.
          return;
        }
        if (cancelled) return;
        resume = inbox.snapshot;
        if (resume) useAlertsStore.getState().rememberStreamCursor(resume);
      }
      if (cancelled) return;

      handle.current = openAlertStream({
        getResumeFrom: () => useAlertsStore.getState().streamCursor,
        onResumeUnavailable: async () => {
          useAlertsStore.getState().rememberStreamCursor(null);
          const inbox = await listNotificationInbox().catch(() => ({
            snapshot: null as string | null,
          }));
          if (inbox.snapshot) useAlertsStore.getState().rememberStreamCursor(inbox.snapshot);
        },
        onNotification: (notification) => {
          useAlertsStore.getState().rememberStreamCursor(notification.id);

          // The badge is the part that must be right immediately: it is what a
          // shop glances at, and it is wrong the moment an alert lands unseen.
          useAlertsStore.setState((state) =>
            notification.read || state.dismissed.includes(notification.id)
              ? state
              : { unreadCount: state.unreadCount + 1 },
          );

          if (
            !shouldToast(notification, useViewing.getState(), useAlertsStore.getState().dismissed)
          ) {
            return;
          }
          useToasts.getState().show({
            id: notification.id,
            title: notification.title,
            body: notification.body,
            orderId: notification.orderId,
          });
        },
      });
    }

    void start();

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") handle.current?.wake();
    });

    return () => {
      cancelled = true;
      subscription.remove();
      handle.current?.close();
      handle.current = null;
    };
  }, [enabled]);
}
