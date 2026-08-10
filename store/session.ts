import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";

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
  logout: () => Promise<void>;
  clearError: () => void;
};

export const useSession = create<SessionState>((set) => ({
  user: null,
  loading: false,
  error: null,
  clearError: () => set({ error: null }),
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
          "Cannot reach GRIDGO from this device. Check this device's connection, then try again — the connection GRIDGO is using is on the Account screen once you are in.",
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
