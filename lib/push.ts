/**
 * Push notifications: everything decidable without the native module.
 *
 * `GET /notifications` and the SSE stream in `lib/alertStream.ts` only reach a
 * phone while the app is open. Push is the third delivery leg — the server
 * sends the same notification record through FCM HTTP v1 to every device the
 * owner has registered, so it arrives with the app closed and the screen
 * locked. See `docs/OPERATIONAL_MODEL_V2_API.md` § "Push notifications" in
 * **gridgo-api** for the contract; it is authoritative and this file must not
 * drift from it.
 *
 * Ported from `gridgo-client`, which shipped this first and proved it on a
 * device. Everything here is that app's except `pushTargetRoute`, which names
 * this app's routes, and the copy, which names a print shop's work.
 *
 * Nothing here imports `expo-notifications`, so every rule below is unit-tested
 * without a native runtime. `store/push.ts` is the thin layer that does talk to
 * the module.
 *
 * ## What a print shop is interrupted for
 *
 * The server decides what it sends; this app cannot filter arrivals. But the
 * card's copy promises a list, and the list a shop was promised is the one this
 * app was built around. A shop opens GRIDGO to find out whether **money or work
 * is at risk**, so an event earns an interruption only when ignoring it costs
 * one of those:
 *
 * - **A job offered to it.** The offer expires inside an SLA; a missed one is
 *   work the shop never had the chance to take.
 * - **Proof owed before a payout can release.** The sharpest case in the whole
 *   product: a shop that walked a job forward without filing evidence has
 *   already done the work and will not be paid for it until it photographs
 *   something. `lib/milestones.ts` calls that money `needsProofMinor`, and it
 *   is the one stuck thing nobody but the shop can unstick.
 * - **A rider arriving for pickup, and a pickup check failing.** Somebody is
 *   standing at the counter. A failed check is worse — the rider is waiting on
 *   an answer and the job has stopped.
 * - **A payout released, and an issue raised against the shop's work.** Money
 *   arriving, and money being held.
 * - **A message from the rider collecting a job, or from Operations.** Neither
 *   is read with the app closed unless the phone says so (gridgo-client#231).
 *   The server rings once per conversation per five minutes, so a burst is one
 *   sound, not ten.
 *
 * Deliberately **not** on that list: ordinary state changes the shop will read
 * the next time it opens the app (a client's downpayment confirmed, a job
 * moving from one production step to the next it took itself). A phone that
 * buzzes for those teaches a shop to ignore the phone, which costs it the four
 * above.
 */

import { Platform } from "react-native";

import { CHAT_LIST_ROUTE, isChatThreadId } from "@/lib/chatThreads";

/**
 * The Android channel the server names in every message.
 *
 * `android.notification.channel_id` is `gridgo_default` on the server side, and
 * **a message naming a channel the app has not created is downgraded or dropped
 * on Android 8+**. The channel must therefore exist before a token is ever
 * requested — which is also what makes the Android 13 permission dialog
 * appear at all, since it does not show until a channel exists.
 *
 * Keep this identifier identical in all three apps: it is the server's string,
 * not each app's.
 */
export const PUSH_CHANNEL_ID = "gridgo_default";

/**
 * Production inactivity only. Ordinary job news stays on `gridgo_default`.
 * The filename is the Android raw resource and the APNs sound name.
 */
export const PUSH_PRODUCTION_NUDGE_CHANNEL_ID = "gridgo_production_nudge";
export const PRODUCTION_NUDGE_SOUND = "notification_alert.mp3";

/**
 * Channel presentation. Importance is high — these are SLA-bearing updates and
 * messages from a rider at the counter — so they sound, vibrate and show a
 * banner. The sound is Android's default, which is what a channel gets when no
 * `sound` is passed; `sound: "default"` would be read as a custom file name.
 */
export const PUSH_CHANNEL = {
  name: "Job and payout alerts",
  description:
    "New work offered to your shop, messages from your rider and Operations, evidence a payout is waiting on, pickups, and what your jobs have paid.",
} as const;

/**
 * Whether the channel installed on this phone actually makes a sound.
 *
 * The server asks for the default sound on every chat push, but on Android 8+
 * the **channel** decides, and its sound and importance belong to the person
 * once it exists: re-creating it does not undo a shop that set it to Silent,
 * and no payload can. So the app reads the installed channel back and says so
 * when it is quiet or off, with the way to the one screen that can change it.
 *
 * - `audible` — default importance or higher, with a sound.
 * - `silent` — it shows, but makes no sound (low importance, or sound removed).
 * - `off` — the shop turned this channel off (importance none).
 * - `unknown` — iOS, web, Expo Go, or an answer that cannot be read.
 *
 * Importance is compared against the module's own enum values, passed in, so
 * this stays pure and the numbering is never copied here.
 */
export type ChannelAudibility = "audible" | "silent" | "off" | "unknown";

export function channelAudibility(
  channel: { importance?: number | null; sound?: string | null } | null | undefined,
  levels: { none: number; default: number },
): ChannelAudibility {
  if (!channel || typeof channel.importance !== "number") return "unknown";
  if (channel.importance === levels.none) return "off";
  // Below "none" is the enum's unknown/unspecified: nothing to say.
  if (channel.importance < levels.none) return "unknown";
  if (channel.importance < levels.default) return "silent";
  return channel.sound == null ? "silent" : "audible";
}

/** The `platform` value `POST /devices` accepts. */
export type DevicePlatform = "android" | "ios" | "web";

/**
 * Map the runtime to the contract's platform value.
 *
 * The contract allows exactly `android`, `ios` and `web`; anything else is
 * `400 invalid_device_platform`. React Native reports `windows`/`macos` on
 * platforms this app does not ship to, so those are refused here rather than
 * being sent for the server to reject.
 */
export function devicePlatform(os: string = Platform.OS): DevicePlatform | null {
  if (os === "android" || os === "ios" || os === "web") return os;
  return null;
}

/**
 * The `data` map of an FCM message, as this app may read it.
 *
 * The keys are exactly `notificationId`, `type`, `orderId` and `at`, all
 * strings, and a key with no value is simply absent — a notification with no
 * job carries no `orderId`. The map is an allowlist on the server, so **no
 * money reaches a lock screen**: the shop's own price, its milestone amounts
 * and GRIDGO's commission cannot appear here even if a future notification
 * record carries them. Nothing else in the payload is contractual, so nothing
 * else is read.
 *
 * A support reply carries no thread ID here on purpose: the tap reads it back
 * from `PATCH /notifications/:id`, which only the notification's owner can do
 * (gridgo-api `docs/REALTIME_EVENTS.md#chat-push-delivery-and-app-follow-up`).
 */
export type PushData = {
  notificationId: string | null;
  type: string | null;
  orderId: string | null;
  at: string | null;
};

function readString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  // Contractually always a string. A number would still be meaningful, and a
  // payload that has drifted must not crash a lock-screen tap.
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

/** Read an FCM `data` map defensively. Never throws — a tap must always land. */
export function parsePushData(raw: unknown): PushData {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    notificationId: readString(source, "notificationId"),
    type: readString(source, "type"),
    orderId: readString(source, "orderId"),
    at: readString(source, "at"),
  };
}

/**
 * The key a tap is remembered by, so it opens its screen once.
 *
 * The server's `notificationId` when the push carries one: a cold-start replay
 * and the live listener can hand the same tap over under different native
 * identifiers. The native identifier otherwise (a local or older push).
 */
export function pushTapKey(identifier: string, data: PushData): string {
  return data.notificationId ? `notification:${data.notificationId}` : `response:${identifier}`;
}

/**
 * Operations wrote in one of the shop's support threads. The push names no
 * thread, so a tap reads it back from `PATCH /notifications/:notificationId`.
 */
export const SUPPORT_MESSAGE_PUSH_TYPE = "support_message";

/**
 * The exact support thread a notice opens, or the chat history when it names
 * none — never a guess at the newest thread, which may be another conversation.
 */
export function supportThreadRoute(threadId: string | null | undefined): string {
  return isChatThreadId(threadId ?? undefined) ? `/chat/${threadId}` : CHAT_LIST_ROUTE;
}

/**
 * Where a tapped notification opens. **App-specific** — the client and rider
 * apps map the same payload onto their own routes.
 *
 * "Tapping a notification opens the right screen, not just the app": an alert
 * about a job opens **that job's workspace**, which is where every one of the
 * four interrupting events is acted on. The offer's Accept and Decline, the
 * yellow "Proof needed" step, the pickup handoff and the issue that is holding
 * the money are all on that one screen, and `lib/jobState.ts` has already
 * decided which of them leads. Routing a proof-owed push straight at the proof
 * form would skip the reason it is owed.
 *
 * An alert with no job behind it — or one whose type this build has never heard
 * of — opens the alerts list, which is the contract's own instruction for an
 * unknown `type` and is always a screen that can explain itself. That list is a
 * pushed screen rather than a tab now; the route moved with it. The push
 * carries no order state, so the job screen fetches the job as it always does.
 *
 * A reply from Operations opens that exact conversation, from the `threadId`
 * the owner's own notification names (`usePushNotifications` reads it); without
 * one it opens the chat history.
 */
export function pushTargetRoute(data: PushData, threadId: string | null = null): string {
  if (data.type === SUPPORT_MESSAGE_PUSH_TYPE) return supportThreadRoute(threadId);
  if (!data.orderId) return "/alerts";
  // A message from the rider collecting the job opens the conversation itself;
  // its back control leads to the job (`app/job/[id]/messages.tsx`).
  if (data.type === "pickup_chat_message") return `/job/${data.orderId}/messages`;
  // A rider's call opens the call screen, which rings only if the call still is;
  // a missed one opens the job, where "Missed call from …" offers to call back.
  if (data.type === "order_call_incoming") return `/call?orderId=${encodeURIComponent(data.orderId)}&mode=incoming`;
  return `/job/${data.orderId}`;
}

/**
 * Permission as this app reasons about it.
 *
 * Android 13+ requires an explicit runtime prompt and a refusal is effectively
 * permanent — the OS stops offering the dialog, so `blocked` is a genuinely
 * different state from `undetermined` and needs different words and a different
 * button. `unknown` is before the first read, including web and Expo Go where
 * there is nothing to read.
 */
export type PushPermission = "unknown" | "undetermined" | "granted" | "blocked";

/**
 * Fold the module's permission response into that.
 *
 * `granted` is the only positive: iOS `provisional` and Android's implicit
 * pre-13 grant both arrive as granted. Denied-but-askable stays `undetermined`
 * because the dialog can still be shown; denied-and-not-askable is `blocked`
 * and only the system settings screen can change it.
 */
export function readPushPermission(response: {
  granted?: boolean;
  status?: string;
  canAskAgain?: boolean;
}): PushPermission {
  if (response.granted || response.status === "granted") return "granted";
  if (response.status === "undetermined") return "undetermined";
  return response.canAskAgain === false ? "blocked" : "undetermined";
}

/** What the enable card should do, if anything. */
export type PushOffer = "hidden" | "ask" | "settings" | "retry" | "silent" | "muted";

/**
 * Whether to offer phone notifications, and how.
 *
 * The ask is never fired cold: this returns `ask` only so a **card** can be
 * drawn, and the OS dialog is raised from that card's button (or from the
 * explainer sheet's, `app/push-prompt.tsx`). A refusal on
 * Android 13+ cannot be taken back by the app, so once blocked the only honest
 * offer is a link to the phone's own settings — and it is still only an offer.
 * Granted or unsupported: nothing is shown, because there is nothing to gain by
 * showing it.
 *
 * `retry` is the exception to that silence. A phone that granted permission and
 * then failed to register is the worst state of the lot: it looks exactly like
 * a working one, and simply never rings. Nothing else in the app would ever say
 * so, so the card stays on screen and says it.
 *
 * `silent` and `muted` are a granted phone whose GRIDGO channel the shop has
 * quietened (`channelAudibility`): the push arrives and nobody hears it, which
 * is how a rider's message at the counter went unnoticed. Only the channel's
 * own settings screen can change that, so the card says so and opens it.
 *
 * **Signed out is an offer, not a silence** — this is the one rule that differs
 * from the client app. A granted phone still registers unclaimed so GRIDGO can
 * announce an update. Sign-in itself does not draw the card; if a signed-out
 * surface ever does, it may ask *only*: a signed-out phone is never told it is
 * blocked or that a registration failed, because neither is something a person
 * at the door can act on, and neither is about them yet.
 */
export function pushOffer(input: {
  supported: boolean;
  signedIn: boolean;
  permission: PushPermission;
  /** A permission ask or a registration call failed. */
  failed?: boolean;
  /** The installed Android channel, read back (`channelAudibility`). */
  channel?: ChannelAudibility;
}): PushOffer {
  if (!input.supported) return "hidden";
  if (!input.signedIn) return input.permission === "undetermined" ? "ask" : "hidden";
  if (input.failed) return input.permission === "blocked" ? "settings" : "retry";
  if (input.permission === "granted" && input.channel === "off") return "muted";
  if (input.permission === "granted" && input.channel === "silent") return "silent";
  if (input.permission === "granted" || input.permission === "unknown") return "hidden";
  return input.permission === "blocked" ? "settings" : "ask";
}

/**
 * One line saying what will arrive, plus the verb on the button.
 *
 * A person deciding on a prompt they can only answer once deserves to know it
 * is their own shop's work and not marketing. **App-specific**: this names the
 * four things in the header's list, in the order a shop would rank them —
 * offered work first, because it expires, and money second.
 */
export function pushOfferCopy(
  offer: Exclude<PushOffer, "hidden">,
  signedIn: boolean = true,
): {
  title: string;
  body: string;
  action: string;
} {
  if (offer === "ask" && !signedIn) {
    // The door. Promising job offers here would be a lie — GRIDGO has no idea
    // whose phone this is yet — so it promises only what an unclaimed phone
    // actually gets, and says the rest follows sign-in.
    return {
      title: "Get GRIDGO news on this phone",
      body: "Turn this on now and GRIDGO can tell this phone when there is a new version to install. Once you sign in, your job offers and payout news come the same way.",
      action: "Turn on notifications",
    };
  }
  if (offer === "retry") {
    return {
      title: "This phone is not registered for notifications",
      body: "Permission is on, but we could not register this phone, so nothing will reach it while GRIDGO is closed. Your alerts still arrive in the app.",
      action: "Try again",
    };
  }
  if (offer === "silent") {
    return {
      title: "GRIDGO notifications make no sound",
      body: "Job offers and messages from your rider and Operations arrive silently, so you can miss them. In notification settings, turn Sound on for Job and payout alerts.",
      action: "Open notification settings",
    };
  }
  if (offer === "muted") {
    return {
      title: "Job and payout alerts are turned off",
      body: "This phone hides GRIDGO's job offers and messages. In notification settings, turn Job and payout alerts on and allow sound.",
      action: "Open notification settings",
    };
  }
  if (offer === "settings") {
    return {
      title: "Notifications are off for GRIDGO",
      body: "Your phone is blocking them, so new work and payout news only appear while the app is open. Turn them on in your phone's settings, then come back to GRIDGO.",
      action: "Open phone settings",
    };
  }
  return {
    title: "Get these on your phone",
    body: "We will notify this phone when GRIDGO offers your shop work, when a payout is waiting on your evidence, when a rider is at your counter, when your rider or Operations sends you a message, when a job pays, and for production reminders when a job on the press has not moved — even with GRIDGO closed.",
    action: "Turn on notifications",
  };
}

/**
 * What a push should do when it lands while the app is open and in front of
 * the person.
 *
 * Nothing visible. The alerts list and the bell's unread mark already carry
 * every notification, and `hooks/useAlertStream.ts` already toasts a live
 * arrival on whatever screen the shop is on — a push is the *same record*, so
 * a banner over it is the same news a third time. The foreground handler therefore
 * suppresses the banner, the tray entry, the sound and the badge, and the
 * arrival is spent making the unread count agree with the platform instead.
 * Backgrounded or closed, this handler never runs and Android draws the
 * server's own title and body.
 */
export const PUSH_FOREGROUND_BEHAVIOR = {
  shouldShowBanner: false,
  shouldShowList: false,
  shouldPlaySound: false,
  shouldSetBadge: false,
} as const;
