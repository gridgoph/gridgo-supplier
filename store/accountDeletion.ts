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
  getAccountDeletionRequest,
  revokeAppleAuthorization,
  type AccountDeletionRequest,
  type PrivacyRequest,
} from "@/lib/api";
import { appleRevocationRefusal, type AppleRevocationRefusal } from "@/lib/apiErrors";
import { reauthorizeWithApple } from "@/lib/appleReauthorize";
import {
  APPLE_BUSY_RETRIES,
  APPLE_BUSY_WAIT_MS,
  APPLE_CHECK_FAILED,
  APPLE_CLIENT_ID,
  APPLE_FILE_FAILED,
  APPLE_NOT_CONFIRMED,
  APPLE_SIGN_IN_FAILED,
  appleRevocationFailure,
  type AppleRetry,
} from "@/lib/appleRevocation";
import { useSignInNotice } from "@/store/signInNotice";

/**
 * The Delete account screen's flow: confirm it is the account holder, then
 * send the request.
 *
 * A store rather than `useState` for the reason `store/loginFlow.ts` gives:
 * every step lands from an async continuation, and on this test stack a plain
 * `useState` write there never re-renders. Nothing is persisted — the password
 * and the code live only while the screen is open, and `reset` on leaving
 * drops them. Only the Apple attempt below outlives the screen, in memory.
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
    /**
     * The Clerk user ID when `appleRevocationApplies` (an iPhone whose Clerk
     * user has an Apple account); null keeps today's flow.
     */
    appleAccount?: string | null,
  ) => Promise<void>;
  /** Disconnect Sign in with Apple, or retry it: after the request is sent only. */
  revokeApple: () => Promise<void>;
  /** Leaving the screen: drops what was typed, keeps the Apple attempt. */
  reset: () => void;
  /** The signed-in account changed: drops the Apple attempt too. */
  forgetAccount: () => void;
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
 * One account's Sign in with Apple disconnect, kept in memory across visits
 * to the screen: leaving Delete account must neither forget a disconnect
 * (asking Apple again could authorize the app again) nor drop a code whose
 * answer was lost (it is replayed, never swapped for a new one).
 *
 * Scoped to the Clerk user and, once GRIDGO names it, the deletion request;
 * `forgetAccount` drops it when the signed-in account changes. Outside the
 * store's state, so nothing that reads or renders state sees the code; never
 * persisted, never logged.
 */
type AppleAttempt = {
  account: string;
  requestId: string | null;
  deletionFiled: boolean;
  heldCode: string | null;
  revoked: boolean;
};
let attempt: AppleAttempt | null = null;

function attemptFor(account: string): AppleAttempt {
  if (attempt?.account !== account) {
    attempt = { account, requestId: null, deletionFiled: false, heldCode: null, revoked: false };
  }
  return attempt;
}

/** A different deletion request starts its own disconnect. */
function scopeTo(current: AppleAttempt, requestId: string) {
  if (current.requestId && current.requestId !== requestId) {
    current.heldCode = null;
    current.revoked = false;
  }
  current.requestId = requestId;
}

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

  submit: async (method, session, appleAccount = null) => {
    if (get().busy) return;
    // Taken before any await: a screen left mid-request bumps `flow`, and
    // nothing from this submission may then touch state or start Apple.
    const mine = flow;
    const live = () => mine === flow;
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
      if (!live()) return;
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
      if (!live()) return;
      set({ sent: true, secret: "", request });
    } catch {
      if (live()) set({ error: DELETION_REQUEST_FAILED });
    } finally {
      if (live()) set({ busy: null });
    }
    if (!live() || !appleAccount || !get().sent) return;
    attemptFor(appleAccount);
    await get().revokeApple();
  },

  revokeApple: async () => {
    const { busy, sent } = get();
    const current = attempt;
    if (busy || !sent || !current) return;
    const mine = flow;
    const live = () => mine === flow && attempt === current;
    const fail = (message: string, retry: AppleRetry) =>
      live() && set({ apple: "failed", appleError: message, appleRetry: retry });
    // A final 401 ends the session and takes this screen down with it, so the
    // sentence goes to Sign in rather than to a screen nobody will see.
    const failFor = (refusal: AppleRevocationRefusal) => {
      const failure = appleRevocationFailure(refusal);
      if (refusal === "signed_out") useSignInNotice.getState().say(failure.message);
      fail(failure.message, failure.retry);
    };
    set({ appleError: null, appleRetry: null });

    // Disconnected already, on an earlier visit: never ask Apple again.
    if (current.revoked) {
      set({ apple: "revoked" });
      return;
    }
    try {
      if (!current.deletionFiled) {
        set({ busy: "revoking", apple: "sending" });
        try {
          await fileAccountDeletionRequest();
        } catch (error) {
          if (!live()) return;
          const refusal = appleRevocationRefusal(error);
          if (refusal === "signed_out") failFor(refusal);
          else fail(APPLE_FILE_FAILED, "same");
          return;
        }
        if (!live()) return;
        current.deletionFiled = true;
      }

      let code = current.heldCode;
      if (!code) {
        // Nothing to replay: read GRIDGO's record before Apple is asked, so a
        // disconnect this phone forgot is not undone by a new sign-in.
        set({ busy: "revoking", apple: "sending" });
        let pending: AccountDeletionRequest | null;
        try {
          pending = await getAccountDeletionRequest();
        } catch (error) {
          if (!live()) return;
          const refusal = appleRevocationRefusal(error);
          if (refusal === "signed_out") failFor(refusal);
          else fail(APPLE_CHECK_FAILED, "same");
          return;
        }
        if (!live()) return;
        if (!pending) {
          current.deletionFiled = false;
          failFor("deletion_request_missing");
          return;
        }
        scopeTo(current, pending.id);
        const latest = pending.appleRevocations.find((entry) => entry.clientId === APPLE_CLIENT_ID);
        if (latest?.status === "revoked") {
          current.revoked = true;
          set({ apple: "revoked" });
          return;
        }

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
        code = current.heldCode = outcome.authorizationCode;
      }

      set({ busy: "revoking", apple: "sending" });
      for (let tries = 0; ; tries += 1) {
        try {
          const result = await revokeAppleAuthorization(APPLE_CLIENT_ID, code);
          if (!live()) return;
          // Spent either way: a recorded result is all this code can return now.
          current.heldCode = null;
          if (result.requestId) scopeTo(current, result.requestId);
          if (result.appleRevocation?.status === "revoked") {
            current.revoked = true;
            set({ apple: "revoked" });
          } else {
            fail(APPLE_NOT_CONFIRMED, "fresh");
          }
          return;
        } catch (error) {
          if (!live()) return;
          const refusal = appleRevocationRefusal(error);
          // GRIDGO's own attempt is still in flight: the same code, after a pause.
          if (refusal === "busy" && tries < APPLE_BUSY_RETRIES) {
            await wait(APPLE_BUSY_WAIT_MS);
            if (!live()) return;
            continue;
          }
          if (refusal === "deletion_request_missing") current.deletionFiled = false;
          if (appleRevocationFailure(refusal).retry !== "same") current.heldCode = null;
          failFor(refusal);
          return;
        }
      }
    } finally {
      if (live()) set({ busy: null });
    }
  },

  reset: () => {
    flow += 1;
    set(initial);
  },

  forgetAccount: () => {
    flow += 1;
    attempt = null;
    set(initial);
  },
}));
