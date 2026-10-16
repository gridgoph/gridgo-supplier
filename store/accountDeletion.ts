import { create } from "zustand";

import {
  confirmationStands,
  confirmWithCode,
  confirmWithPassword,
  DELETION_NO_SESSION,
  DELETION_REQUEST_FAILED,
  sendDeletionCode,
  type DeletionConfirmMethod,
  type ReverifySession,
} from "@/lib/accountDeletion";
import { createPrivacyRequest, type PrivacyRequest } from "@/lib/api";

/**
 * The Delete account screen's flow: confirm it is the account holder, then
 * send the request.
 *
 * A store rather than `useState` for the reason `store/loginFlow.ts` gives:
 * every step lands from an async continuation, and on this test stack a plain
 * `useState` write there never re-renders. Nothing is persisted — the password
 * and the code live only while the screen is open, and `reset` on leaving
 * drops them.
 */
type AccountDeletionState = {
  /** Typed password or emailed code. Never persisted, never logged. */
  secret: string;
  /** A code has been emailed and is waiting to be typed. */
  codeSent: boolean;
  /** Where Clerk sent the code, masked by Clerk. */
  destination: string;
  busy: "checking" | "sending" | "emailing" | null;
  /** About what was typed: drawn under the field. */
  fieldError: string | null;
  /** About everything else: drawn as a notice. */
  error: string | null;
  /** When the account holder last proved it was them, for a retried send. */
  confirmedAt: number | null;
  sent: boolean;
  /** The privacy request the send created, for its answer-by date. */
  request: PrivacyRequest | null;
  setSecret: (secret: string) => void;
  emailCode: (session: ReverifySession | null | undefined) => Promise<void>;
  submit: (
    method: DeletionConfirmMethod,
    session: ReverifySession | null | undefined,
  ) => Promise<void>;
  reset: () => void;
};

const initial = {
  secret: "",
  codeSent: false,
  destination: "",
  busy: null,
  fieldError: null,
  error: null,
  confirmedAt: null,
  sent: false,
  request: null,
};

export const useAccountDeletion = create<AccountDeletionState>((set, get) => ({
  ...initial,

  setSecret: (secret) => set({ secret, fieldError: null }),

  emailCode: async (session) => {
    if (get().busy) return;
    if (!session) {
      set({ error: DELETION_NO_SESSION });
      return;
    }
    set({ busy: "emailing", error: null, fieldError: null });
    try {
      const outcome = await sendDeletionCode(session);
      if (outcome.status === "ok") {
        set({ codeSent: true, destination: outcome.destination, secret: "" });
      } else {
        set({ error: outcome.message });
      }
    } finally {
      set({ busy: null });
    }
  },

  submit: async (method, session) => {
    if (get().busy) return;
    set({ error: null, fieldError: null });

    // Only the send can fail once the person is confirmed. A retry inside the
    // window goes straight to the send rather than spending another code.
    if (!confirmationStands(get().confirmedAt, Date.now())) {
      if (!session) {
        set({ error: DELETION_NO_SESSION });
        return;
      }
      set({ busy: "checking" });
      const secret = get().secret;
      const outcome =
        method === "password"
          ? await confirmWithPassword(session, secret)
          : await confirmWithCode(session, secret);
      if (outcome.status !== "ok") {
        set(
          outcome.status === "refused"
            ? { busy: null, fieldError: outcome.message }
            : { busy: null, error: outcome.message },
        );
        return;
      }
      set({ confirmedAt: Date.now(), secret: "" });
    }

    set({ busy: "sending" });
    try {
      // The privacy queue (`docs/LEGAL_API.md`), not the legacy
      // `/me/account-deletion-request`: it is where See my data and Correct my
      // data land too, with a due date and a record of what was kept.
      const request = await createPrivacyRequest("deletion");
      set({ sent: true, secret: "", request });
    } catch {
      set({ error: DELETION_REQUEST_FAILED });
    } finally {
      set({ busy: null });
    }
  },

  reset: () => set(initial),
}));
