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
import {
  createPrivacyRequest,
  fileAccountDeletionRequest,
  revokeAppleAuthorization,
  type PrivacyRequest,
} from "@/lib/api";
import { appleRevocationRefusal } from "@/lib/apiErrors";
import { reauthorizeWithApple } from "@/lib/appleReauthorize";
import {
  APPLE_BUSY_RETRIES,
  APPLE_BUSY_WAIT_MS,
  APPLE_CLIENT_ID,
  APPLE_FILE_FAILED,
  APPLE_NOT_CONFIRMED,
  APPLE_SIGN_IN_FAILED,
  appleRevocationFailure,
  type AppleRetry,
} from "@/lib/appleRevocation";

/**
 * The Delete account screen's flow: confirm it is the account holder, then
 * send the request.
 *
 * A store rather than `useState` for the reason `store/loginFlow.ts` gives:
 * every step lands from an async continuation, and on this test stack a plain
 * `useState` write there never re-renders. Nothing is persisted — the password
 * and the code live only while the screen is open, and `reset` on leaving
 * drops them.
 *
 * On an Apple-linked iPhone the sent request is followed by disconnecting
 * Sign in with Apple (`lib/appleRevocation.ts`). The request is already filed
 * by then, so nothing in that step can take it back.
 */
type AccountDeletionState = {
  /** Typed password or emailed code. Never persisted, never logged. */
  secret: string;
  /** A code has been emailed and is waiting to be typed. */
  codeSent: boolean;
  /** Where Clerk sent the code, masked by Clerk. */
  destination: string;
  busy: "checking" | "sending" | "emailing" | "apple" | "revoking" | null;
  /** About what was typed: drawn under the field. */
  fieldError: string | null;
  /** About everything else: drawn as a notice. */
  error: string | null;
  /** When the account holder last proved it was them, for a retried send. */
  confirmedAt: number | null;
  sent: boolean;
  /** The privacy request the send created, for its answer-by date. */
  request: PrivacyRequest | null;
  /** Sign in with Apple's disconnect; `none` wherever it does not apply. */
  apple: "none" | "asking" | "sending" | "revoked" | "cancelled" | "failed";
  appleError: string | null;
  appleRetry: AppleRetry;
  setSecret: (secret: string) => void;
  emailCode: (session: ReverifySession | null | undefined) => Promise<void>;
  submit: (
    method: DeletionConfirmMethod,
    session: ReverifySession | null | undefined,
    /** `appleRevocationApplies`: an iPhone whose Clerk user has an Apple account. */
    appleLinked?: boolean,
  ) => Promise<void>;
  /** Disconnect Sign in with Apple, or retry it: after the request is sent only. */
  revokeApple: () => Promise<void>;
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
  apple: "none" as const,
  appleError: null,
  appleRetry: null,
};

/**
 * Apple's authorization code, held between a lost answer and its retry. Kept
 * out of the store's state so nothing that reads or renders state ever sees
 * it; never persisted, never logged.
 */
let heldCode: string | null = null;
/** Whether the deletion request the Apple route checks for is on file. */
let deletionFiled = false;
/** Bumped by `reset`, so a continuation from a left screen changes nothing. */
let flow = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

  submit: async (method, session, appleLinked = false) => {
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
      // data land too, with a due date and a record of what was kept. An
      // Apple-linked iPhone files the legacy one too, in `revokeApple`,
      // because Apple's disconnect is checked against it.
      const request = await createPrivacyRequest("deletion");
      set({ sent: true, secret: "", request });
    } catch {
      set({ error: DELETION_REQUEST_FAILED });
    } finally {
      set({ busy: null });
    }
    if (appleLinked && get().sent) await get().revokeApple();
  },

  revokeApple: async () => {
    const { busy, sent, apple } = get();
    if (busy || !sent || apple === "revoked") return;
    const mine = flow;
    const live = () => mine === flow;
    const fail = (message: string, retry: AppleRetry) =>
      live() && set({ apple: "failed", appleError: message, appleRetry: retry });
    set({ appleError: null, appleRetry: null });
    try {
      if (!deletionFiled) {
        set({ busy: "revoking", apple: "sending" });
        try {
          await fileAccountDeletionRequest();
        } catch (error) {
          const refusal = appleRevocationRefusal(error);
          if (refusal === "signed_out") {
            const failure = appleRevocationFailure(refusal);
            fail(failure.message, failure.retry);
          } else {
            fail(APPLE_FILE_FAILED, "same");
          }
          return;
        }
        if (!live()) return;
        deletionFiled = true;
      }

      let code = heldCode;
      if (!code) {
        set({ busy: "apple", apple: "asking" });
        const outcome = await reauthorizeWithApple();
        if (!live()) return;
        if (outcome.status === "cancelled") {
          set({ apple: "cancelled" });
          return;
        }
        if (outcome.status === "failed") {
          fail(APPLE_SIGN_IN_FAILED, "fresh");
          return;
        }
        code = heldCode = outcome.authorizationCode;
      }

      set({ busy: "revoking", apple: "sending" });
      for (let attempt = 0; ; attempt += 1) {
        try {
          const result = await revokeAppleAuthorization(APPLE_CLIENT_ID, code);
          if (!live()) return;
          // Spent either way: a recorded result is all this code can return now.
          heldCode = null;
          if (result?.status === "revoked") set({ apple: "revoked" });
          else fail(APPLE_NOT_CONFIRMED, "fresh");
          return;
        } catch (error) {
          if (!live()) return;
          const refusal = appleRevocationRefusal(error);
          // GRIDGO's own attempt is still in flight: the same code, after a pause.
          if (refusal === "busy" && attempt < APPLE_BUSY_RETRIES) {
            await wait(APPLE_BUSY_WAIT_MS);
            if (!live()) return;
            continue;
          }
          if (refusal === "deletion_request_missing") deletionFiled = false;
          const failure = appleRevocationFailure(refusal);
          if (failure.retry !== "same") heldCode = null;
          fail(failure.message, failure.retry);
          return;
        }
      }
    } finally {
      if (live()) set({ busy: null });
    }
  },

  reset: () => {
    flow += 1;
    heldCode = null;
    deletionFiled = false;
    set(initial);
  },
}));
