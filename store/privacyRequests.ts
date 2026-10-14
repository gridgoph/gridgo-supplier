import { create } from "zustand";

import * as api from "@/lib/api";
import type { PrivacyRequest, PrivacyRequestKind } from "@/lib/api";
import { PRIVACY_REQUEST_FAILED } from "@/lib/legal";

/**
 * The shop's own privacy requests (`/me/privacy-requests`): the list on
 * Your data, and the send from the request screen.
 *
 * A store rather than screen state because the send lands from an async
 * continuation, and so the list is already up to
 * date when the shop is taken back to it. Never persisted.
 */
type PrivacyRequestsState = {
  requests: PrivacyRequest[];
  status: "idle" | "loading" | "ready" | "failed";
  sending: boolean;
  error: string | null;
  /** The request just sent, for the confirmation. */
  sent: PrivacyRequest | null;
  load: () => Promise<void>;
  send: (kind: PrivacyRequestKind, details?: string) => Promise<PrivacyRequest | null>;
  clearSend: () => void;
  reset: () => void;
};

const initial = {
  requests: [] as PrivacyRequest[],
  status: "idle" as const,
  sending: false,
  error: null,
  sent: null,
};

/** Bumped by `reset`; a read or send started before it is discarded. */
let generation = 0;

export const usePrivacyRequests = create<PrivacyRequestsState>((set, get) => ({
  ...initial,

  load: async () => {
    const started = generation;
    if (!get().requests.length) set({ status: "loading" });
    try {
      const requests = await api.listPrivacyRequests();
      if (started !== generation) return;
      set({ requests: sortNewestFirst(requests), status: "ready" });
    } catch {
      if (started !== generation) return;
      set({ status: get().requests.length ? "ready" : "failed" });
    }
  },

  send: async (kind, details) => {
    if (get().sending) return null;
    const started = generation;
    set({ sending: true, error: null, sent: null });
    try {
      const request = await api.createPrivacyRequest(kind, details);
      if (started !== generation) return null;
      set({
        sent: request,
        requests: sortNewestFirst([request, ...get().requests.filter((r) => r.id !== request.id)]),
      });
      return request;
    } catch {
      if (started === generation) set({ error: PRIVACY_REQUEST_FAILED });
      return null;
    } finally {
      if (started === generation) set({ sending: false });
    }
  },

  clearSend: () => set({ sending: false, error: null, sent: null }),
  reset: () => {
    generation += 1;
    set(initial);
  },
}));

function sortNewestFirst(requests: PrivacyRequest[]): PrivacyRequest[] {
  return [...requests].sort(
    (a, b) => (Date.parse(b.requestedAt) || 0) - (Date.parse(a.requestedAt) || 0),
  );
}
