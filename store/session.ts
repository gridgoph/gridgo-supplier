import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "supplier" as const;
export const DEMO_EMAIL = "supplier@gridgo.local";

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
 * A shop signs itself up and is signed in immediately, but it is not matchable
 * until Operations approves it — the platform enforces that, and `/jobs` simply
 * returns nothing meanwhile. A floor screen reading "nothing needs you" would
 * be a lie in that state, so the app routes an unapproved shop somewhere that
 * says what is actually happening.
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
  login: (email: string, password: string) => Promise<void>;
  /** Resolves true when the account was created and the shop is signed in. */
  signup: (input: api.SupplierSignup) => Promise<boolean>;
  /** Re-read the account, so an approval that lands is picked up on return. */
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
  signup: async (input) => {
    set({ loading: true, error: null });
    try {
      const { user } = await api.signupSupplier(input);
      set({ user, loading: false });
      return true;
    } catch (e) {
      set({
        loading: false,
        error: humanizeApiError(
          e,
          offlineMessage("open your GRIDGO account"),
        ),
      });
      return false;
    }
  },
  refresh: async () => {
    if (!get().user) return;
    try {
      set({ user: await api.me() });
    } catch {
      // A 401 already clears the session through the unauthorized handler, and
      // anything else leaves the account as last known rather than signing a
      // shop out because one request did not land.
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
      set({ user, loading: false });
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
    await api.logout();
    set({ user: null });
  },
}));

/**
 * Expired / invalid bearer → clear session here. The root `Stack.Protected`
 * guard then drops signed-in routes; call sites must not sprinkle redirects.
 */
api.setUnauthorizedHandler(() => {
  useSession.setState({ user: null });
});
