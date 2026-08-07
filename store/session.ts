import { create } from "zustand";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";

/** Expected role for this binary — mismatched login is rejected. */
export const APP_ROLE = "supplier" as const;
export const DEMO_EMAIL = "supplier@gridgo.local";

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
          error: `This account is role "${user.role}". Open the ${user.role} app instead.`,
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
          error: e.message || `Request failed (HTTP ${e.status}).`,
        });
        return;
      }
      // Network / fetch failure — backend never answered with an HTTP status.
      set({
        loading: false,
        error: `Cannot reach the backend at ${api.getApiBase()}. Check that gridgo-api is running and reachable on this network.`,
      });
    }
  },
  logout: async () => {
    await api.logout();
    set({ user: null });
  },
}));
