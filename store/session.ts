import { useAlertsStore } from "@/store/alerts";
import { useToasts } from "@/store/toasts";
import { liveGeneration, setLiveOwner } from "@/lib/live";
import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { sessionWaitHold } from "@/lib/sessionWait";
import { releaseClerkSession } from "@/lib/clerkSignIn";
import { serializeDeviceMutation, usePush } from "@/store/push";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "supplier" as const;

export type AuthSource = "none" | "legacy" | "clerk";

export const SESSION_ENDED_MESSAGE = "Your session ended. Sign in again to keep working.";
export const ACCESS_WITHDRAWN_MESSAGE = "Supplier access was withdrawn from this account. Contact Operations for help.";

export type IdentityState =
  | { kind: "loading" }
  | { kind: "signed_out"; reason?: "session_ended" }
  | { kind: "supplier" }
  | { kind: "unassigned"; email?: string | null }
  | { kind: "mismatch"; destination: string; email?: string | null }
  | { kind: "error"; reason?: "access_withdrawn"; message: string; email?: string | null };

let refreshVersion = 0;

let clerkSignOutHandler: (() => Promise<void>) | null = null;

/** Registered by the Clerk bridge so the store can keep logout sequencing in one place. */
export function setClerkSignOutHandler(
  handler: (() => Promise<void>) | null,
): void {
  clerkSignOutHandler = handler;
}

/**
 * Single source for `Stack.Protected` and launch redirects.
 * Any path that clears `user` (logout, role reject, 401) relies on this.
 */
export function isSignedIn(user: User | null | undefined): boolean {
  return user != null;
}

/**
 * Whether GRIDGO will actually send this shop work.
 *
 * A shop that has just applied is signed in immediately, but it is not
 * matchable until Operations approves it — the platform enforces that, and
 * `/jobs` simply returns nothing meanwhile. Home still mounts and says
 * Operations is reviewing the shop; it must not read "nothing needs you".
 *
 * The API backfills a status onto every supplier account, so a missing one is
 * not a legacy shop that should be let through — it is an account the platform
 * has not accredited.
 */
export function isMatchable(user: User | null | undefined): boolean {
  return user?.verificationStatus === "approved";
}

/**
 * The app a non-supplier account belongs in, named the way a person would.
 * The platform's own role strings never reach a screen.
 */
export function appForRole(role: User["role"]): string {
  switch (role) {
    case "client":
      return "GRIDGO for clients";
    case "rider":
      return "GRIDGO Rider";
    case "ops_admin":
    case "super_admin":
      return "the GRIDGO Operations portal";
    default:
      return "a different GRIDGO app";
  }
}

type SessionState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  authSource: AuthSource;
  identity: IdentityState;
  sessionWait: "in" | "out" | null;
  setClerkIdentity: (identity: IdentityState) => void;
  adoptClerkUser: (user: User) => boolean;
  clearClerkIdentity: () => void;
  endClerkSession: () => void;
  login: (email: string, password: string) => Promise<void>;
  /** Public apply via Clerk enroll. Lands pending; Operations still has to approve matching. */
  enrollSupplier: (input: api.SupplierEnrollment, idempotencyKey: string) => Promise<boolean>;
  /** Re-read the account, so an approval that lands is picked up on return. */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  beginSessionWait: (tone: "in" | "out") => void;
  clearSessionWait: () => void;
};

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  loading: false,
  error: null,
  authSource: "none",
  identity: { kind: "signed_out" },
  sessionWait: null,
  clearError: () => set({ error: null }),
  beginSessionWait: (tone) => set({ sessionWait: tone }),
  clearSessionWait: () => set({ sessionWait: null }),
  endClerkSession: () => {
    const { identity, sessionWait } = get();
    if (identity.kind === "signed_out" && identity.reason === "session_ended") return;
    api.setTokenProvider(null);
    api.setToken(null);
    set({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out", reason: "session_ended" },
      sessionWait: null,
    });
    // An already-dead session may refuse signOut. Keep the sign-in door open;
    // its existing leftover-session recovery can settle Clerk on the next tap.
    // An explicit logout already owns the Clerk sign-out in its finally block.
    if (clerkSignOutHandler && sessionWait !== "out") void releaseClerkSession(clerkSignOutHandler);
  },
  setClerkIdentity: (identity) =>
    set((state) => ({
      user: null,
      loading: identity.kind === "loading",
      error: null,
      authSource: "clerk",
      identity,
      // Leftover Clerk restore must not raise Signing you in on the login
      // tap. Google's callback / activated path sets sessionWait itself.
      sessionWait:
        identity.kind === "loading" || identity.kind === "signed_out"
          ? state.sessionWait
          : null,
    })),
  adoptClerkUser: (user) => {
    if (user.role !== APP_ROLE) {
      set({
        user: null,
        loading: false,
        error: null,
        authSource: "clerk",
        identity: {
          kind: "mismatch",
          destination: appForRole(user.role),
        },
        sessionWait: null,
      });
      return false;
    }

    set({
      user,
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
      sessionWait: null,
    });
    return true;
  },
  clearClerkIdentity: () => {
    if (get().authSource !== "clerk") return;
    api.setTokenProvider(null);
    api.setToken(null);
    set({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
      sessionWait: get().sessionWait === "out" ? "out" : null,
    });
  },
  refresh: async () => {
    if (!get().user) return;
    const version = ++refreshVersion;
    const generation = liveGeneration();
    const current = () => version === refreshVersion && generation === liveGeneration();
    try {
      const user = await api.me();
      if (!current()) return;
      if (user.role !== APP_ROLE) get().adoptClerkUser(user);
      else set({ user });
    } catch (error) {
      if (!current()) return;
      if (error instanceof api.ApiError && error.status === 403) {
        get().setClerkIdentity({ kind: "error", reason: "access_withdrawn", message: ACCESS_WITHDRAWN_MESSAGE });
      }
      // A 401 already clears the session through the unauthorized handler, and
      // anything else leaves the account as last known rather than signing a
      // shop out because one request did not land.
    }
  },
  enrollSupplier: async (input, idempotencyKey) => {
    set({ loading: true, error: null });
    try {
      const user = await api.enrollSupplier(input, idempotencyKey);
      set({ loading: false });
      return get().adoptClerkUser(user);
    } catch (e) {
      set({
        loading: false,
        error:
          e instanceof api.ApiError
            ? humanizeApiError(
                e,
                "GRIDGO could not open your shop account. Check your details and try again.",
              )
            : offlineMessage("open your GRIDGO account"),
      });
      return false;
    }
  },
  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const { user } = await api.login(email, password);
      if (user.role !== APP_ROLE) {
        await api.logout();
        set({
          user: null,
          loading: false,
          error: `This account is not a print shop. Open ${appForRole(user.role)} to sign in with it.`,
        });
        return;
      }
      set({
        user,
        loading: false,
        authSource: "legacy",
        identity: { kind: "supplier" },
      });
    } catch (e) {
      if (e instanceof api.ApiError) {
        if (e.status === 401) {
          set({ loading: false, error: "Incorrect email or password." });
          return;
        }
        set({
          loading: false,
          error:
            e.status >= 500
              ? "GRIDGO could not sign you in just now. Wait a moment and try again."
              : "GRIDGO would not accept that sign-in. Check the email and password, then try again.",
        });
        return;
      }
      // Network / fetch failure — backend never answered with an HTTP status.
      set({
        loading: false,
        error:
          "Cannot reach GRIDGO from this device. Check this device's connection, then try again — the address this app is calling is on the Settings screen once you are in.",
      });
    }
  },
  logout: async () => {
    const startedAt = Date.now();
    set({ sessionWait: "out" });
    // The device token rides along with the sign-out rather than being
    // unregistered separately: afterwards the bearer token is dead, so a phone
    // that signed out first could no longer authenticate the unregister and
    // would keep waking up for the previous shop's job offers. The server
    // accepts a sign-out with no token exactly as before, so a phone that never
    // got one is unaffected.
    //
    // Afterwards the phone goes back on the unclaimed list rather than off it
    // entirely: a shop that signs out has not uninstalled GRIDGO, and "there is
    // a new version" still has to reach it.
    const deviceToken = usePush.getState().token;
    const clerkOwned = get().authSource === "clerk";
    const hadDomainSession = Boolean(get().user);
    try {
      // Unassigned and mismatched Clerk identities never opened or claimed a
      // GRIDGO domain session, so there is nothing server-side to release.
      if (hadDomainSession) await serializeDeviceMutation(() => api.logout(usePush.getState().token ?? deviceToken));
    } finally {
      if (clerkOwned && clerkSignOutHandler) {
        await clerkSignOutHandler();
      }
      api.setTokenProvider(null);
      api.setToken(null);
      set({
        user: null,
        loading: false,
        error: null,
        authSource: "none",
        identity: { kind: "signed_out" },
        sessionWait: "out",
      });
      void usePush.getState().release();
      await sessionWaitHold(startedAt);
      set({ sessionWait: null });
    }
  },
}));

/**
 * Expired / invalid bearer → clear session here. The root `Stack.Protected`
 * guard then drops signed-in routes; call sites must not sprinkle redirects.
 */
api.setUnauthorizedHandler(() => {
  const { authSource, identity } = useSession.getState();
  if (identity.kind === "signed_out" && identity.reason === "session_ended") return;
  if (authSource === "clerk") {
    useSession.getState().endClerkSession();
    return;
  }
  api.setToken(null);
  useSession.setState({
    user: null,
    loading: false,
    authSource: "none",
    identity: { kind: "signed_out" },
  });
});

useSession.subscribe((state, previous) => {
  const next = state.user?.id ?? null;
  if (next === (previous.user?.id ?? null)) return;
  setLiveOwner(next);
  useAlertsStore.getState().bindOwner(next);
  useToasts.getState().clear();
});
