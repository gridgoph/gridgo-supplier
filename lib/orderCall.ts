/*
  Internet calls between the shop and the rider collecting a job (report
  16B159C0, gridgo-client#233). gridgo-api `docs/CALLS_API.md` is the contract.

  The call is audio over WebRTC, on mobile data or Wi-Fi: no phone number is
  shown to either side, nothing is dialled, and no per-minute charge applies.
  GRIDGO never records it. Only the shop and its assigned rider are parties
  (`pair: "pickup"`), and only while the rider is on the way to collect
  (`rider_assigned`) — calling closes at pick-up, although the pickup chat
  stays open longer.

  The job carries no "callable" flag, so the window is read from what GRIDGO
  already says about this pair: a pickup conversation that is `open` (a rider
  accepted and is a party) and the job still waiting to be collected. A start
  GRIDGO refuses (`call_not_available`) is still said plainly — the server is
  the authority, this only decides whether to draw the button.

  Everything here is pure; `lib/callSession.ts` drives the native side.
*/

import { pickupChatOf } from "@/lib/pickupChat";

export type CallState = "ringing" | "accepted" | "declined" | "cancelled" | "missed" | "ended";
export type CallRole = "client" | "rider" | "supplier";

export type CallParty = { firstName: string; role: CallRole | string };

export type OrderCall = {
  id: string;
  orderId: string;
  pair: "pickup" | "delivery" | string;
  state: CallState;
  caller: CallParty;
  callee: CallParty;
  /** True when this shop placed the call. */
  mine: boolean;
  createdAt: string;
  ringExpiresAt: string;
  acceptedAt: string | null;
  endedAt: string | null;
  leaseExpiresAt: string | null;
};

export const CALL_PAIR = "pickup";
/** While a call screen is up it asks for state and signals this often, SSE or not. */
export const CALL_POLL_MS = 2_000;
/** Both apps renew their own lease this often while a call is accepted. */
export const CALL_HEARTBEAT_MS = 20_000;
/** A lease not renewed for this long is over, on GRIDGO and here. */
export const CALL_LEASE_MS = 90_000;
/** The inbox and push types this app acts on. */
export const CALL_INCOMING_NOTICE = "order_call_incoming";
export const CALL_MISSED_NOTICE = "order_call_missed";
/** An incoming notice older than the 30-second ring cannot still be ringing. */
export const CALL_RING_MS = 30_000;

const STATES: readonly CallState[] = ["ringing", "accepted", "declined", "cancelled", "missed", "ended"];
const TERMINAL: readonly CallState[] = ["declined", "cancelled", "missed", "ended"];

export function isTerminal(state: CallState): boolean {
  return TERMINAL.includes(state);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function time(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function party(value: unknown, fallbackRole: CallRole): CallParty {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const role = text(raw.role) ?? fallbackRole;
  // A first name only; GRIDGO already falls back to the role word for anything that looks like contact details.
  const name = text(raw.firstName)?.split(/\s+/)[0]?.slice(0, 40) ?? null;
  return { firstName: name ?? roleWord(role), role };
}

function roleWord(role: string): string {
  if (role === "rider") return "Rider";
  if (role === "client") return "Client";
  return "Shop";
}

/** Read one call projection defensively; null when it is not one. */
export function parseCall(raw: unknown): OrderCall | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const id = text(value.id);
  const orderId = text(value.orderId);
  const state = value.state as CallState;
  const createdAt = time(value.createdAt);
  const ringExpiresAt = time(value.ringExpiresAt);
  if (!id || !orderId || !STATES.includes(state) || !createdAt || !ringExpiresAt) return null;
  return {
    id,
    orderId,
    pair: text(value.pair) ?? CALL_PAIR,
    state,
    caller: party(value.caller, "supplier"),
    callee: party(value.callee, "rider"),
    mine: value.mine === true,
    createdAt,
    ringExpiresAt,
    acceptedAt: time(value.acceptedAt),
    endedAt: time(value.endedAt),
    leaseExpiresAt: time(value.leaseExpiresAt),
  };
}

export function parseCalls(raw: unknown): OrderCall[] {
  return Array.isArray(raw) ? raw.map(parseCall).filter((call): call is OrderCall => call !== null) : [];
}

/** The other person on the call, from this shop's side. */
export function otherParty(call: OrderCall): CallParty {
  return call.mine ? call.callee : call.caller;
}

/** A call this shop should be ringing for right now. A stale or duplicate push must not ring. */
export function isRingingForMe(call: OrderCall, now: number = Date.now()): boolean {
  return call.state === "ringing" && !call.mine && Date.parse(call.ringExpiresAt) > now;
}

/** The one live call on this pair, if GRIDGO lists one. */
export function activeCall(calls: readonly OrderCall[], pair: string = CALL_PAIR): OrderCall | null {
  return calls.find((call) => call.pair === pair && (call.state === "ringing" || call.state === "accepted")) ?? null;
}

/* --------------------------------------------------------------------------
   Whether the job offers a call
   -------------------------------------------------------------------------- */

type CallableOrder = { state: string; riderId?: string | null; pickupChat?: unknown };

export type PickupCallAvailability =
  | { kind: "open"; riderFirstName: string | null }
  /** A rider is collecting but calling is not open (picked up, or no rider yet). Nothing is drawn. */
  | { kind: "closed" };

export function pickupCallAvailability(order: CallableOrder | null | undefined): PickupCallAvailability {
  if (!order) return { kind: "closed" };
  const chat = pickupChatOf(order);
  if (!chat || chat.status !== "open" || order.state !== "rider_assigned") return { kind: "closed" };
  return { kind: "open", riderFirstName: chat.riderFirstName };
}

/* --------------------------------------------------------------------------
   Missed calls on the job
   -------------------------------------------------------------------------- */

export type MissedCall = {
  callId: string;
  /** "Missed call from Sam" — or "You declined Sam's call" when the shop said no. */
  title: string;
  at: string;
  firstName: string;
};

/**
 * The rider's most recent unanswered call, while it is the latest thing on
 * this pair. A call the shop placed since — or any later call — answers it, so
 * the notice goes.
 */
export function latestMissedCall(calls: readonly OrderCall[], pair: string = CALL_PAIR): MissedCall | null {
  const latest = [...calls]
    .filter((call) => call.pair === pair)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (!latest || latest.mine) return null;
  if (latest.state !== "missed" && latest.state !== "cancelled" && latest.state !== "declined") return null;
  const name = latest.caller.firstName;
  return {
    callId: latest.id,
    title: latest.state === "declined" ? `You declined ${name}'s call` : `Missed call from ${name}`,
    at: latest.endedAt ?? latest.createdAt,
    firstName: name,
  };
}

/** "Just now" / "4 min ago" / "3:40 PM", in Davao time. */
export function missedAtLabel(at: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(at)) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  return new Date(at).toLocaleTimeString("en-PH", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" });
}

/* --------------------------------------------------------------------------
   What the call screen says
   -------------------------------------------------------------------------- */

/**
 * Where a call is, from the shop's side. `permission` and `unsupported` stop
 * before any request; `incoming` is the callee's ringing screen.
 */
export type CallPhase =
  | "permission"
  | "unsupported"
  | "calling"
  | "ringing"
  | "incoming"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "ended";

export type EndReason =
  /** The rider said no. */
  | "declined"
  /** Nobody picked up within the ring. */
  | "no_answer"
  /** The rider rang and stopped, or the ring ran out on this phone. */
  | "missed"
  /** Either side hung up a connected call. */
  | "ended"
  /** The shop hung up before the rider answered. */
  | "cancelled"
  /** Audio stopped reaching either side, or the lease ran out. */
  | "network_lost"
  /** Calling closed: picked up, reassigned, or GRIDGO refused. */
  | "not_available"
  /** The shop has called too often in ten minutes. */
  | "too_many"
  /** A request failed and the call could not start. */
  | "failed";

/** The server's terminal state, as this shop experiences it. */
export function endReasonFor(call: Pick<OrderCall, "state" | "mine">): EndReason {
  switch (call.state) {
    case "declined":
      return call.mine ? "declined" : "missed";
    case "missed":
      return call.mine ? "no_answer" : "missed";
    case "cancelled":
      return call.mine ? "cancelled" : "missed";
    default:
      return "ended";
  }
}

/** The status line under the name. */
export function phaseLabel(phase: CallPhase): string {
  switch (phase) {
    case "calling":
      return "Calling…";
    case "ringing":
      return "Ringing…";
    case "incoming":
      return "Incoming call";
    case "connecting":
      return "Connecting…";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting…";
    case "permission":
      return "Microphone needed";
    case "unsupported":
      return "Calls are not in this app";
    case "ended":
      return "Call ended";
  }
}

export type EndCopy = { title: string; body: string; canCallAgain: boolean };

/** A clear end reason, with what the shop can do next. */
export function endCopy(reason: EndReason, name: string, durationLabel: string | null = null): EndCopy {
  switch (reason) {
    case "declined":
      return { title: "Call declined", body: `${name} could not take the call. Send a message instead, or try again in a minute.`, canCallAgain: true };
    case "no_answer":
      return { title: "Not answered", body: `${name} did not pick up. They will see that you called.`, canCallAgain: true };
    case "missed":
      return { title: `Missed call from ${name}`, body: "Call back while they are on the way to your shop.", canCallAgain: true };
    case "cancelled":
      return { title: "Call cancelled", body: `${name} will see that you tried to call.`, canCallAgain: true };
    case "ended":
      return { title: "Call ended", body: durationLabel ? `You talked for ${durationLabel}.` : "The call has ended.", canCallAgain: true };
    case "network_lost":
      return {
        title: "Call dropped",
        body: "The connection was lost. Check your mobile data or Wi-Fi, then call again.",
        canCallAgain: true,
      };
    case "not_available":
      return {
        title: "Calling has closed",
        body: "You can call the rider only while they are on the way to collect this job. Messages stay open.",
        canCallAgain: false,
      };
    case "too_many":
      return {
        title: "Too many calls",
        body: "You have called several times in a few minutes. Wait a moment, or send a message.",
        canCallAgain: false,
      };
    case "failed":
      return {
        title: "The call did not go through",
        body: "GRIDGO could not be reached. Check your connection, then call again.",
        canCallAgain: true,
      };
  }
}

/** "0:07", "12:40", "1:02:09". */
export function formatCallDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}` : `${minutes}:${seconds}`;
}

/** Spoken form of the timer, for screen readers. */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const parts = [] as string[];
  if (minutes) parts.push(`${minutes} ${minutes === 1 ? "minute" : "minutes"}`);
  parts.push(`${seconds} ${seconds === 1 ? "second" : "seconds"}`);
  return parts.join(" ");
}

/** What an Expo Go build (no WebRTC native module) says instead of crashing. */
export const CALLS_NEED_APP = "Calls need the latest GRIDGO app from the download page";

/** The route for the call screen. */
export function callHref(input: { orderId: string; mode: "start" | "incoming"; name?: string | null }) {
  const params: { orderId: string; mode: "start" | "incoming"; name?: string } = { orderId: input.orderId, mode: input.mode };
  if (input.name) params.name = input.name;
  return { pathname: "/call" as const, params };
}

/** The row on the job that places a call. */
export function pickupCallEntry(riderFirstName: string | null, supported: boolean) {
  const name = riderFirstName || "the rider";
  return {
    title: riderFirstName ? `Call ${riderFirstName}` : "Call the rider",
    detail: supported
      ? "No call charges. Uses mobile data or Wi-Fi, and your number stays private."
      : CALLS_NEED_APP,
    accessibilityLabel: `Call ${name} over the internet`,
  };
}

/**
 * The two call notices in the shop's words. GRIDGO writes them once for every
 * app ("Open the order to call back"); a shop has jobs, and the notice carries
 * no name, so it says "the rider". The job screen names them.
 */
export function presentCallAlert(alert: { type?: string }): { title: string; body: string } | null {
  if (alert.type === CALL_MISSED_NOTICE) {
    return { title: "Missed call from the rider", body: "The rider collecting a job tried to call your shop. Open the job to call back." };
  }
  if (alert.type === CALL_INCOMING_NOTICE) {
    return { title: "The rider called", body: "The rider collecting a job called your shop. Open the job to call back if you missed it." };
  }
  return null;
}
