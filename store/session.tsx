import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { User } from "@/lib/api";
import * as api from "@/lib/api";

export const APP_ROLE = "supplier" as const;
export const DEMO_EMAIL = "supplier@gridgo.local";

type SessionContextValue = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.login(email, password);
      if (result.user.role !== APP_ROLE) {
        await api.logout();
        setUser(null);
        setError(`This account is role "${result.user.role}". Open the ${result.user.role} app instead.`);
        return;
      }
      setUser(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "login_failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      error,
      login,
      logout,
      clearError: () => setError(null),
    }),
    [user, loading, error, login, logout],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession requires SessionProvider");
  return ctx;
}
