import type { PushPermission } from "@/lib/push";

/**
 * When the phone-notifications explainer (`app/push-prompt.tsx`) may open.
 *
 * Android 13+ raises its permission dialog only from an app's own request, and
 * until this sheet existed the only request was a tap on `PushEnableCard`,
 * drawn on screens a new shop may never open. Production had no supplier phone
 * registered at all. So the explainer opens by itself — once a shop lands on
 * Home, and again at most once a week while the phone still says no. It never
 * raises the OS dialog itself: that follows its "Turn on notifications" tap.
 *
 * The rules are pure so they can be tested without a navigator or a clock.
 */

/** A shop that said "Not now" hears about this again a week later, not sooner. */
export const PUSH_PROMPT_REOFFER_MS = 7 * 24 * 60 * 60 * 1000;

/** The route a shop lands on after sign-in, and on every signed-in launch. */
export const PUSH_PROMPT_LANDING = "/home";

export function shouldOfferPushPrompt(input: {
  supported: boolean;
  signedIn: boolean;
  permission: PushPermission;
  /** The shop is on the landing screen, not deep in a flow or a tapped job. */
  onLanding: boolean;
  /** When the explainer last opened on this phone, whatever the answer. */
  lastOfferedAt: number | null;
  now: number;
}): boolean {
  if (!input.supported || !input.signedIn || !input.onLanding) return false;
  // Granted needs nothing; unknown is before the first read, so wait for it.
  if (input.permission !== "undetermined" && input.permission !== "blocked") return false;
  if (input.lastOfferedAt === null) return true;
  const elapsed = input.now - input.lastOfferedAt;
  // A clock set backwards would otherwise hold the offer back indefinitely.
  return elapsed < 0 || elapsed >= PUSH_PROMPT_REOFFER_MS;
}

/** One line of the explainer's list: what a notification is for. */
export type PushPromptReason = {
  key: "offers" | "payouts" | "pickups" | "reminders";
  title: string;
  body: string;
};

/**
 * What arrives, in the order a shop ranks it: offered work expires first,
 * then money, then someone standing at the counter, then a nudge.
 */
export const PUSH_PROMPT_REASONS: readonly PushPromptReason[] = [
  {
    key: "offers",
    title: "Job offers",
    body: "New work for your shop, while there is still time to accept it.",
  },
  {
    key: "payouts",
    title: "Payouts",
    body: "When a payout is waiting on your photo, and when a job pays.",
  },
  {
    key: "pickups",
    title: "Pickups",
    body: "When a rider is at your counter.",
  },
  {
    key: "reminders",
    title: "Production reminders",
    body: "When a job on your press has not moved.",
  },
];

/**
 * The explainer's words. A blocked phone gets the same list but an honest
 * button: Android will not show the dialog again, so only the phone's own
 * settings can turn notifications back on.
 */
export function pushPromptCopy(permission: "undetermined" | "blocked"): {
  title: string;
  body: string;
  action: string;
} {
  if (permission === "blocked") {
    return {
      title: "Notifications are off for GRIDGO",
      body: "Your phone is blocking them, so you only see new work while the app is open. Turn them on in your phone's settings, then come back to GRIDGO.",
      action: "Open phone settings",
    };
  }
  return {
    title: "Know when your shop is needed",
    body: "Turn on notifications and GRIDGO tells this phone about your jobs, even when the app is closed.",
    action: "Turn on notifications",
  };
}
