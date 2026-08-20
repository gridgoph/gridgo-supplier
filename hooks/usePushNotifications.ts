import { useRouter, type Href } from "expo-router";
import { useEffect, useRef } from "react";

import * as api from "@/lib/api";
import { parsePushData, PUSH_FOREGROUND_BEHAVIOR, pushTargetRoute } from "@/lib/push";
import { useAlertsStore } from "@/store/alerts";
import { usePush } from "@/store/push";
import { isMatchable, isSignedIn, useSession } from "@/store/session";

/**
 * Push, wired to the app: registration, token rotation, and opening the right
 * screen when a shop taps an alert.
 *
 * Mounted once, from the root layout. Everything it decides comes from
 * `lib/push.ts`; everything it stores goes through `store/push.ts`. Ported from
 * `gridgo-client`; two things are this app's, both because a shop's session has
 * a state a customer's does not — see `isMatchable` in `store/session.ts`.
 */

/**
 * Every call into `expo-notifications` from this file, wrapped.
 *
 * The module reaches native eagerly and **throws** where the native module is
 * absent — Expo Go on Android has had no remote push since SDK 53, and a build
 * whose autolinking missed the package behaves identically. Unwrapped, that
 * throw happens at module scope or inside the root layout's effect, which takes
 * down the whole app on a screen nobody can get past: observed on the emulator,
 * as `Cannot find native module 'ExpoPushTokenManager'` followed by
 * `Cannot read property 'ErrorBoundary' of undefined`.
 *
 * `store/push.ts` already wraps its own calls for this reason. This is the
 * other half, and it must stay: push failing is a feature not working, and it
 * must never be an app that will not open.
 */
/** A rejected promise from the module is the same non-event as a throw. */
function noop(): void {}

function withoutNativeModule<T>(call: () => T): T | null {
  try {
    return call();
  } catch {
    return null;
  }
}

type NotificationsModule = typeof import("expo-notifications");

/** Deferred: a static import crashes Expo Go Android at launch. */
function notifications(): NotificationsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications") as NotificationsModule;
  } catch {
    return null;
  }
}

/**
 * What a push does while the app is open and in front of the person.
 *
 * Nothing visible — see `PUSH_FOREGROUND_BEHAVIOR`. Set at module scope
 * deliberately: this must be in place before the first notification can arrive,
 * and a handler installed inside an effect races the notification that woke the
 * app. It runs only in the foreground, so a closed or backgrounded app is
 * untouched and Android draws the server's own title and body.
 */
withoutNativeModule(() => {
  const Notifications = notifications();
  Notifications?.setNotificationHandler({
    handleNotification: async () => ({ ...PUSH_FOREGROUND_BEHAVIOR }),
  });
});

/**
 * Make the unread badge agree with the platform.
 *
 * A foreground arrival is spent on this and nothing else. `useAlertStream`
 * already increments the badge and toasts a live alert on whatever screen the
 * shop is on, and a push is the same record — so this recomputes from the list
 * rather than adding to it, which is what makes the two legs safe to run at
 * once. A failure costs nothing: every list in this app reloads on focus.
 */
async function refreshUnread(): Promise<void> {
  try {
    useAlertsStore.getState().syncFrom(await api.listNotifications());
  } catch {
    // Offline, or the session just ended. The next focused list catches up.
  }
}

export function usePushNotifications(): void {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const signedIn = isSignedIn(user);
  /**
   * A tap can only be spent on a shop GRIDGO actually sends work to.
   *
   * The job workspace sits behind the `matchable` guard in `app/_layout.tsx`,
   * so pushing into it before Operations approves would bounce off the guard
   * and leave the shop somewhere it did not ask to be; the accreditation screen
   * it is already on is the honest answer, and it is the screen that explains
   * why nothing else is there.
   *
   * **Known and deliberate gap.** The alerts screen is only behind `signedIn`,
   * so a waiting shop could open it — and the message it is waiting for arrives
   * in it. This gate is tighter than that target needs, which means a pending
   * shop tapping an alert with no job behind it waits here until it is approved
   * rather than landing on the list. That was true while alerts were a tab as
   * well, so nothing regressed when the route moved; loosening it is its own
   * change, and it wants a device run because the deferred-push path below has
   * an open cold-start question of its own.
   */
  const routable = signedIn && isMatchable(user);

  /**
   * A tap that arrived before there was anywhere to send it.
   *
   * An alert tapped from a cold start opens the app on the sign-in screen,
   * because the session lives in memory and a killed process has none. Routing
   * to the job then would bounce off the route guard, so the target waits here
   * and is spent when a session appears.
   *
   * **Known gap, recorded on the client app after a device run:** in the one
   * cold-start run observed there, this deferred push did not land — signing in
   * went to the home screen. The likely cause is that `Stack.Protected` swaps
   * the root stack's children in the same commit that flips the guard, so a
   * `push` issued then is discarded. Taps route correctly whenever the process
   * is still alive. Persisting the session would remove the situation; re-test
   * on a device before trusting this path.
   */
  const pending = useRef<string | null>(null);
  /** Response identifiers already routed, so a tap opens its screen once. */
  const routed = useRef(new Set<string>());

  useEffect(() => {
    // Register on **every launch**, signed in or not, and again whenever the
    // account changes. The contract calls this idempotent and cheap and asks
    // apps to do exactly that — a token Firebase has quietly reissued is the
    // common way push stops arriving with nothing visibly wrong.
    //
    // Not gated on a session: a phone with permission granted and nobody
    // signed in registers unclaimed, which is what lets GRIDGO tell a shop that
    // installed the app and stopped there to update it. Signing in re-runs this
    // with a bearer and claims the same token — see `store/push.ts`.
    //
    // Not gated on `matchable` either: a shop waiting on accreditation is
    // exactly the shop whose approval it most wants to hear about while the app
    // is closed.
    void usePush.getState().registerIfGranted();
  }, [signedIn, user?.id]);

  useEffect(() => {
    const route = (identifier: string, data: unknown) => {
      if (routed.current.has(identifier)) return;
      routed.current.add(identifier);
      const target = pushTargetRoute(parsePushData(data));
      const session = useSession.getState().user;
      if (!isSignedIn(session) || !isMatchable(session)) {
        pending.current = target;
        return;
      }
      // The push carries no job state by design, so the job screen fetches the
      // job itself. Re-read the list too: the record behind this push is
      // already in it, and its unread badge should not survive the tap.
      void refreshUnread();
      // `pushTargetRoute` returns a route this app declares; typed routes
      // cannot see that through a string it built at runtime.
      router.push(target as Href);
    };

    const Notifications = notifications();

    // A tap while the app is running or backgrounded.
    const tap = withoutNativeModule(() =>
      Notifications?.addNotificationResponseReceivedListener((response) => {
        route(
          response.notification.request.identifier,
          response.notification.request.content.data,
        );
      }),
    );

    // A tap that launched the app. The listener above does not replay it.
    withoutNativeModule(() =>
      Notifications?.getLastNotificationResponseAsync().then((response) => {
        if (!response) return;
        route(
          response.notification.request.identifier,
          response.notification.request.content.data,
        );
      }, noop),
    );

    // A push landing in the foreground shows nothing (see the handler above);
    // its whole effect is that the unread badge catches up.
    const received = withoutNativeModule(() =>
      Notifications?.addNotificationReceivedListener(() => {
        void refreshUnread();
      }),
    );

    // Firebase can reissue a token while the app is running. A stale one stops
    // delivering silently, which is the failure nobody reports.
    const rotated = withoutNativeModule(() =>
      Notifications?.addPushTokenListener((token) => {
        if (typeof token.data === "string" && token.data) {
          void usePush.getState().adoptToken(token.data);
        }
      }),
    );

    return () => {
      tap?.remove();
      received?.remove();
      rotated?.remove();
    };
  }, [router]);

  useEffect(() => {
    if (!routable || !pending.current) return;
    const target = pending.current;
    pending.current = null;
    router.push(target as Href);
  }, [routable, router]);
}
