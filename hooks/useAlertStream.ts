import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

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

    handle.current = openAlertStream({
      onNotification: (notification) => {
        // The badge is the part that must be right immediately: it is what a
        // shop glances at, and it is wrong the moment an alert lands unseen.
        useAlertsStore.setState((state) =>
          notification.read || state.dismissed.includes(notification.id)
            ? state
            : { unreadCount: state.unreadCount + 1 },
        );

        if (!shouldToast(notification, useViewing.getState())) return;
        useToasts.getState().show({
          id: notification.id,
          title: notification.title,
          body: notification.body,
          orderId: notification.orderId,
        });
      },
    });

    const subscription = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next === "active") handle.current?.wake();
    });

    return () => {
      subscription.remove();
      handle.current?.close();
      handle.current = null;
    };
  }, [enabled]);
}
