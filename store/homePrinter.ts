import { create } from "zustand";

import { loadHomePrinter, updateHomePrinter, type HomePrinterRead, type HomeWrite } from "@/lib/homePrinter";

/**
 * The owner's home printing as GRIDGO last answered it (`GET /me/home-printer`).
 *
 * Not persisted: the switch, the level and the pin are GRIDGO's, and a stale
 * "You're online" would be worse than none. `home` is `false` once GRIDGO has
 * said this account is not a home printer, so screens draw exactly what they
 * drew before.
 */
type HomePrinterState = {
  /** null: not read yet; false: not a home printer (or Staff, or no such GRIDGO). */
  home: HomePrinterRead | false | null;
  error: string | null;
  load: () => Promise<HomePrinterRead | false | null>;
  update: (change: Record<string, unknown>, fallback: string) => Promise<HomeWrite>;
  reset: () => void;
};

let loading: Promise<HomePrinterRead | false | null> | null = null;

export const useHomePrinter = create<HomePrinterState>()((set, get) => ({
  home: null,
  error: null,
  load: () => {
    loading ??= (async () => {
      const read = await loadHomePrinter();
      if (read.status === "ok") set({ home: read.read, error: null });
      else if (read.status === "none") set({ home: false, error: null });
      else set({ error: read.message });
      return get().home;
    })().finally(() => {
      loading = null;
    });
    return loading;
  },
  update: async (change, fallback) => {
    const current = get().home;
    if (!current) return { status: "failed", message: "GRIDGO has not loaded your home printing yet. Try again.", code: null };
    const result = await updateHomePrinter(current.version, change, fallback);
    if (result.status === "ok") set({ home: result.read, error: null });
    return result;
  },
  reset: () => set({ home: null, error: null }),
}));

/** True once GRIDGO said this signed-in owner prints from home. */
export function isHomePrinter(home: HomePrinterRead | false | null): home is HomePrinterRead {
  return Boolean(home);
}
