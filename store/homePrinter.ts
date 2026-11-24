import { create } from "zustand";

import { liveGeneration } from "@/lib/live";
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
/**
 * Bumped by `reset()` on every account change. An answer that started under an
 * earlier epoch (or live generation) is dropped, so one owner's private pin and
 * status can never land on the next account's screens.
 */
let epoch = 0;
const ticket = () => `${epoch}:${liveGeneration()}`;

export const useHomePrinter = create<HomePrinterState>()((set, get) => ({
  home: null,
  error: null,
  load: () => {
    loading ??= (async () => {
      const mine = ticket();
      const read = await loadHomePrinter();
      if (mine !== ticket()) return null;
      if (read.status === "ok") set({ home: read.read, error: null });
      else if (read.status === "none") set({ home: false, error: null });
      else set({ error: read.message });
      return get().home;
    })();
    const current = loading;
    current
      .finally(() => {
        if (loading === current) loading = null;
      })
      .catch(() => undefined);
    return current;
  },
  update: async (change, fallback) => {
    const current = get().home;
    if (!current) return { status: "failed", message: "GRIDGO has not loaded your home printing yet. Try again.", code: null };
    const mine = ticket();
    const result = await updateHomePrinter(current.version, change, fallback);
    if (mine !== ticket()) return { status: "failed", message: fallback, code: null };
    if (result.status === "ok") set({ home: result.read, error: null });
    return result;
  },
  reset: () => {
    epoch += 1;
    loading = null;
    set({ home: null, error: null });
  },
}));

/** True once GRIDGO said this signed-in owner prints from home. */
export function isHomePrinter(home: HomePrinterRead | false | null): home is HomePrinterRead {
  return Boolean(home);
}
