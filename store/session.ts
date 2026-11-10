import { useAlertsStore } from "@/store/alerts";
import { useToasts } from "@/store/toasts";
import { useAccountDeletion } from "@/store/accountDeletion";
import { useShopContact } from "@/store/shopContact";
import { useShopHours } from "@/store/shopHours";
import { afterShopPlanLoads, useShopPlan } from "@/store/shopPlan";
import { usePrivacyRequests } from "@/store/privacyRequests";
import { useSignInNotice } from "@/store/signInNotice";
import { liveGeneration, setLiveOwner } from "@/lib/live";
import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { apiErrorCode, humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { APPLY_CONSENT_REFUSED, isLegalRefusal } from "@/lib/legal";
import { sessionWaitHold } from "@/lib/sessionWait";
import { releaseClerkSession } from "@/lib/clerkSignIn";
import { serializeDeviceMutation, usePush } from "@/store/push";
import { usePlayOptIn } from "@/store/playOptIn";
import { useTesterProgram } from "@/store/testerProgram";
import { isJoiningTeam } from "@/store/teamJoin";
import { useJobDrafts } from "@/store/jobDrafts";
import { useTeamRemovedNotice } from "@/store/teamRemovedNotice";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "supplier" as const;

export type AuthSource = "none" | "legacy" | "clerk";

export const SESSION_ENDED_MESSAGE = "Your session ended. Sign in again to keep working.";
export const ACCESS_WITHDRAWN_MESSAGE = "Supplier access was withdrawn from this account. Contact Operations for help.";
export const TEAM_REMOVED_MESSAGE = "The owner removed you from the shop's team.";
export const TEAM_REMOVED_TITLE = "You are off the team";
export const TEAM_REMOVED_DETAIL = "The owner removed you from the shop, so you were signed out. Ask them for a new invite to join again.";

export type IdentityState =
  | { kind: "loading" }
  /**
   * `team_removed`: the Owner removed this person while they were signed in.
   * The Clerk session was ended with it; Sign in says why.
   */
  | { kind: "signed_out"; reason?: "session_ended" | "refused" | "team_removed" }
  | { kind: "supplier" }
  | { kind: "unassigned"; email?: string | null }
  /** Joined a shop's team; the Owner has not approved yet. No shop routes are open. */
  | { kind: "team_pending"; shopName: string }
  | { kind: "mismatch"; destination: string; email?: string | null }
  | {
      kind: "error";
      reason?: "access_withdrawn" | "team_removed";
      message: string;
      email?: string | null;
    };

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
/**
 * Signed out by GRIDGO with something Sign in has to say: the session ended,
 * or an account that is not a shop was refused. Either reason sends launch to
 * Sign in, and the Clerk bridge leaves it alone while Clerk is still letting go
 * of the session — remounting the stack must not lose the sentence.
 */
export function signedOutWithNotice(identity: IdentityState): boolean {
  return (
    identity.kind === "signed_out" &&
    (identity.reason === "session_ended" ||
      identity.reason === "refused" ||
      identity.reason === "team_removed")
  );
}

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
/**
 * A teammate the Owner limited to receiving and processing orders
 * (gridgo-api `docs/SHOP_TEAM_API.md`). GRIDGO refuses every Owner-only route
 * to them; the app hides those routes so a Staff member never meets a refusal.
 */
export function isShopStaff(user: User | null | undefined): boolean {
  return user?.shopRole === "staff";
}

/** Full access: the shop's own account, or a teammate made Owner. */
export function isShopOwner(user: User | null | undefined): boolean {
  return user != null && user.shopRole !== "staff";
}

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
  /** Sign in refused an account that is not a shop. Call before Clerk signs out. */
  refuseSignIn: () => void;
  /** A new sign-in attempt starts; the last refusal or removal notice no longer applies. */
  clearSignInRefusal: () => void;
  login: (email: string, password: string) => Promise<void>;
  /** Public apply via Clerk enroll. Lands pending; Operations still has to approve matching. */
  enrollSupplier: (input: api.SupplierEnrollment, idempotencyKey: string) => Promise<boolean>;
  /** Re-read the account, so an approval that lands is picked up on return. */
  refresh: () => Promise<void>;
  /**
   * Ask GRIDGO again where this person stands on a shop's team — after a
   * claim, while waiting for the Owner, and when a request was refused for it.
   */
  recheckTeam: () => Promise<void>;
  /**
   * GRIDGO refused a request, or the live stream said so: the Owner removed
   * this person. Ends this app's Clerk session (only this one — the person's
   * Clerk account and other apps are untouched) and drops every private copy
   * of the shop. Someone on their way into a team keeps the session, because
   * claiming a new invite needs it.
   */
  teamAccessRemoved: () => void;
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
  refuseSignIn: () => {
    api.setTokenProvider(null);
    api.setToken(null);
    set({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out", reason: "refused" },
      sessionWait: null,
    });
  },
  clearSignInRefusal: () => {
    const { identity } = get();
    useTeamRemovedNotice.getState().clear();
    if (identity.kind === "signed_out" && (identity.reason === "refused" || identity.reason === "team_removed")) {
      set({ identity: { kind: "signed_out" } });
    }
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
    if (user.role === APP_ROLE && user.shopStatus === "pending") {
      set({
        user: null,
        loading: false,
        error: null,
        authSource: "clerk",
        identity: { kind: "team_pending", shopName: user.supplierName || "the shop" },
        sessionWait: null,
      });
      return false;
    }
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
      if (apiErrorCode(error) === "shop_access_removed" || apiErrorCode(error) === "shop_approval_pending") {
        // The transport's shop-access handler has already moved the session.
        return;
      }
      if (error instanceof api.ApiError && error.status === 403) {
        get().setClerkIdentity({ kind: "error", reason: "access_withdrawn", message: ACCESS_WITHDRAWN_MESSAGE });
      }
      // A 401 already clears the session through the unauthorized handler, and
      // anything else leaves the account as last known rather than signing a
      // shop out because one request did not land.
    }
  },
  recheckTeam: async () => {
    if (get().authSource !== "clerk") return;
    try {
      const user = await api.me({ ignoreUnauthorized: true });
      const now = get();
      if (now.user && now.user.id === user.id && user.shopStatus !== "pending") {
        set({ user });
        return;
      }
      get().adoptClerkUser(user);
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === "shop_access_removed") get().teamAccessRemoved();
      // Anything else leaves the screen as it is; the next check tries again.
    }
  },
  teamAccessRemoved: () => {
    const { identity, authSource, user } = get();
    // Only someone not in a shop yet — signing in to claim a new invite — keeps
    // the session. A teammate who was working always goes, whatever join
    // intent an earlier tap left behind.
    if (isJoiningTeam() && !user && identity.kind !== "supplier") {
      useJobDrafts.getState().clearAll();
      if (identity.kind === "error" && identity.reason === "team_removed") return;
      set({
        user: null,
        loading: false,
        error: null,
        authSource: "clerk",
        identity: { kind: "error", reason: "team_removed", message: TEAM_REMOVED_MESSAGE },
        sessionWait: null,
      });
      return;
    }
    if (identity.kind === "signed_out" && identity.reason === "team_removed") return;
    api.setTokenProvider(null);
    api.setToken(null);
    // Clearing `user` is what drops the shop's cached jobs, alerts, toasts and
    // hours (the user-id subscriber below). Sign in then explains the removal.
    set({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out", reason: "team_removed" },
      sessionWait: null,
    });
    useTeamRemovedNotice.getState().mark();
    // Typed notes and promise times on the shop's jobs stay with the shop.
    useJobDrafts.getState().clearAll();
    // The phone goes back on the unclaimed list: no more of this shop's offers.
    void usePush.getState().release();
    if (authSource === "clerk" && clerkSignOutHandler) void releaseClerkSession(clerkSignOutHandler);
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
        // GRIDGO refused the agreement itself — a version changed while the
        // shop read, most likely. Nothing was enrolled; apply asks again.
        error: isLegalRefusal(e)
          ? APPLY_CONSENT_REFUSED
          : e instanceof api.ApiError
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
  if (signedOutWithNotice(identity)) return;
  // What the task whose call this was still had to say, before the teardown
  // below drops it with the account.
  useSignInNotice.getState().sessionEnded();
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

/**
 * GRIDGO refused a request because this person's place on a shop's team
 * changed. Removal drops the shop's screens and cached orders at once (the
 * user-id subscriber below clears what belongs to the shop); a pending answer
 * re-reads where the person stands.
 */
api.setShopAccessHandler((code) => {
  const state = useSession.getState();
  if (state.authSource !== "clerk") return;
  if (code === "shop_access_removed") state.teamAccessRemoved();
  else void state.recheckTeam();
});

// Launch reconciliation: a phone that opens signed out, or to an account this
// app does not serve, keeps no tester reminder from whoever used it before.
useSession.subscribe((state, previous) => {
  const kind = state.identity.kind;
  if (kind === previous.identity.kind || kind === "loading" || kind === "supplier") return;
  useTesterProgram.getState().forget();
});

useSession.subscribe((state, previous) => {
  const next = state.user?.id ?? null;
  if (next === (previous.user?.id ?? null)) return;
  setLiveOwner(next);
  useAlertsStore.getState().bindOwner(next);
  useToasts.getState().clear();
  // One shop's privacy requests are never drawn for the next one on this phone.
  usePrivacyRequests.getState().reset();
  // A Sign in with Apple disconnect belongs to the account that started it.
  useAccountDeletion.getState().forgetAccount();
  if (next) useSignInNotice.getState().clear();
  else useSignInNotice.getState().forgetHeld();
  useShopHours.getState().reset();
  useShopContact.getState().reset();
  // Tester reminders belong to the shop signed in: signing out cancels them,
  // and the next account's open plans its own.
  if (next) useTesterProgram.getState().reset();
  else useTesterProgram.getState().forget();
  // The Play opt-in answer is one account's; the next is asked afresh.
  usePlayOptIn.getState().reset();
  // Phone-only closures carry no account. They leave with the shop that was
  // signed in, and the next shop claims only what is left unclaimed.
  afterShopPlanLoads(() => {
    if (previous.user) useShopPlan.getState().clearBlackouts();
    if (next) useShopPlan.getState().claimBlackouts(next);
  });
});

/**
 * A removal that ended the session before Sign in could say so (the web
 * reloads on Clerk sign-out; a phone may be closed) is said on the next launch.
 * The Clerk bridge calls this once Clerk reports nobody signed in; any account
 * settling here drops it.
 */
export function restoreTeamRemovedNotice(): void {
  const apply = () => {
    if (!useTeamRemovedNotice.getState().pending) return;
    const { identity, user, authSource } = useSession.getState();
    if (user || authSource !== "none" || identity.kind !== "signed_out" || identity.reason) return;
    useSession.setState({ identity: { kind: "signed_out", reason: "team_removed" } });
  };
  if (useTeamRemovedNotice.persist.hasHydrated()) apply();
  else useTeamRemovedNotice.persist.onFinishHydration(apply);
}

useSession.subscribe((state) => {
  const kind = state.identity.kind;
  if (kind !== "signed_out" && kind !== "loading") useTeamRemovedNotice.getState().clear();
});
