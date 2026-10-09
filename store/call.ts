import { create } from "zustand";

import * as api from "@/lib/api";
import { loadCallRuntime } from "@/lib/callRuntime";
import { CallSession, type CallSnapshot } from "@/lib/callSession";
import { liveGeneration } from "@/lib/live";
import { readMicPermission, requestMicPermission, type MicPermission } from "@/lib/microphone";
import {
  CALL_INCOMING_NOTICE,
  CALL_RING_MS,
  activeCall,
  isRingingForMe,
  type OrderCall,
} from "@/lib/orderCall";

/*
  The one call this phone is on, at most. A call is a full-screen takeover, so
  there is never a second: an incoming call that arrives during one is
  declined, as the contract asks ("decline a second incoming call when
  already speaking").

  How an incoming call is found — every path ends in `checkIncoming(orderId)`,
  which reads GRIDGO's list and rings only for a call that is still ringing,
  is not this shop's own, and has time left. A stale or duplicate push never
  rings twice:

  - the SSE `calls` pointer for an order (`hooks/useAlertStream.ts`);
  - an `order_call_incoming` record in the inbox, read by the stream, a
    foreground push, or a return to the app (`noticeIncoming`);
  - a tapped `order_call_incoming` push, which opens `/call` in incoming mode.
*/

type CallStore = {
  /** The live or just-ended session's snapshot; null when there is none. */
  snapshot: CallSnapshot | null;
  /** The microphone, as last read — the call screen explains before asking. */
  mic: MicPermission | null;
  /** Calls already rung for, so the same record never rings again. */
  rung: string[];
  /** True while `app/call.tsx` is on screen. */
  screenOpen: boolean;
  /** The incoming call the screen was last put up for. */
  presented: string | null;
  setScreenOpen: (open: boolean) => void;
  markPresented: (callId: string) => void;
  /** Place a call to the rider collecting `orderId`. */
  start: (orderId: string, riderFirstName: string | null) => Promise<void>;
  /** Ring for a call the rider is placing, if it is still ringing. */
  checkIncoming: (orderId: string) => Promise<boolean>;
  /** Inbox records that may be ringing calls. */
  noticeIncoming: (items: readonly { type?: string; orderId?: string; at: string; read?: boolean }[]) => void;
  /** GRIDGO said this order's calls changed. */
  callsChanged: (orderId: string) => void;
  readMic: () => Promise<MicPermission>;
  askMic: () => Promise<MicPermission>;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMute: () => void;
  toggleSpeaker: () => void;
  /** The call screen has gone; forget an ended call. */
  clear: () => void;
  /** Account changed: stop any call without a word to GRIDGO. */
  reset: () => void;
};

let session: CallSession | null = null;

function live(): boolean {
  return Boolean(session && !session.isFinished);
}

export const useCall = create<CallStore>((set, get) => {
  function attach(orderId: string, riderFirstName: string | null): CallSession | null {
    const runtime = loadCallRuntime();
    if (!runtime) {
      set({
        snapshot: {
          orderId,
          phase: "unsupported",
          call: null,
          otherName: riderFirstName || "the rider",
          muted: false,
          speaker: false,
          connectedAt: null,
          endReason: null,
          endedByMe: false,
          durationMs: null,
        },
      });
      return null;
    }
    const generation = liveGeneration();
    const next = new CallSession(orderId, riderFirstName, runtime, (snapshot) => {
      if (session !== next) return;
      if (generation !== liveGeneration()) {
        next.dispose();
        return;
      }
      set({ snapshot });
    });
    session = next;
    set({ snapshot: next.current });
    return next;
  }

  return {
    snapshot: null,
    mic: null,
    rung: [],
    screenOpen: false,
    presented: null,
    setScreenOpen: (screenOpen) => set({ screenOpen }),
    markPresented: (presented) => set({ presented }),

    async start(orderId, riderFirstName) {
      if (live()) return;
      const mic = await get().readMic();
      if (mic !== "granted") {
        // The screen explains and asks; nothing reaches GRIDGO until the shop says yes.
        session = null;
        set({
          snapshot: {
            orderId,
            phase: loadCallRuntime() ? "permission" : "unsupported",
            call: null,
            otherName: riderFirstName || "the rider",
            muted: false,
            speaker: false,
            connectedAt: null,
            endReason: null,
            endedByMe: false,
            durationMs: null,
          },
        });
        return;
      }
      const next = attach(orderId, riderFirstName);
      await next?.startOutgoing();
    },

    async checkIncoming(orderId) {
      if (!loadCallRuntime()) return false;
      let calls: OrderCall[];
      try {
        calls = await api.listCalls(orderId);
      } catch {
        return false;
      }
      const ringing = activeCall(calls);
      if (!ringing || !isRingingForMe(ringing) || get().rung.includes(ringing.id)) return false;
      set({ rung: [...get().rung.slice(-49), ringing.id] });
      if (live()) {
        // Already on a call: the rider hears a decline, not an endless ring.
        if (session?.current.call?.id !== ringing.id) {
          await api.callAction(ringing.orderId, ringing.id, "decline").catch(() => undefined);
        }
        return false;
      }
      const next = attach(orderId, ringing.caller.firstName);
      next?.receive(ringing);
      void get().readMic();
      return Boolean(next);
    },

    noticeIncoming(items) {
      const now = Date.now();
      const orders = new Set<string>();
      for (const item of items) {
        if (item.type !== CALL_INCOMING_NOTICE || !item.orderId) continue;
        const age = now - Date.parse(item.at);
        // Only a ring that could still be going; older records are history.
        if (Number.isFinite(age) && age >= -5_000 && age <= CALL_RING_MS + 5_000) orders.add(item.orderId);
      }
      for (const orderId of orders) void get().checkIncoming(orderId);
    },

    callsChanged(orderId) {
      if (live() && session?.current.orderId === orderId) session.poke();
      else void get().checkIncoming(orderId);
    },

    async readMic() {
      const mic = await readMicPermission();
      set({ mic });
      return mic;
    },

    async askMic() {
      const mic = await requestMicPermission();
      set({ mic });
      return mic;
    },

    async accept() {
      if (!live()) return;
      if (get().mic !== "granted") {
        const mic = await get().askMic();
        if (mic !== "granted") return;
      }
      await session?.accept();
    },

    async decline() {
      await session?.decline();
    },

    async hangUp() {
      if (live()) await session?.hangUp();
      else set({ snapshot: null });
    },

    toggleMute() {
      if (live()) session?.setMuted(!session.current.muted);
    },

    toggleSpeaker() {
      if (live()) session?.setSpeaker(!session.current.speaker);
    },

    clear() {
      if (live()) return;
      session = null;
      set({ snapshot: null });
    },

    reset() {
      session?.dispose();
      session = null;
      set({ snapshot: null, rung: [], presented: null });
    },
  };
});
