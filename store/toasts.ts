import { create } from "zustand";

/**
 * Transient notices that arrive without being asked for.
 *
 * The only source today is the live alert stream: something happened to a job
 * while the shop was looking at another screen. A toast is not a substitute for
 * the Alerts tab, which is where the record lives — it is the interruption that
 * says go and look.
 *
 * Nothing is ever *only* a toast. Every one of these corresponds to a
 * notification the platform is already holding, so a missed or dismissed toast
 * costs nothing. That is what makes it safe to auto-dismiss.
 */

export type Toast = {
  id: string;
  title: string;
  body: string;
  /** Set when the toast is about a job the shop can open. */
  orderId?: string;
};

type ToastState = {
  toasts: Toast[];
  show: (toast: Toast) => void;
  dismiss: (id: string) => void;
  clear: () => void;
};

/** At most this many on screen. Older ones drop off the bottom of the stack. */
export const MAX_TOASTS = 2;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  show: (toast) =>
    set((s) =>
      s.toasts.some((existing) => existing.id === toast.id)
        ? s
        : { toasts: [toast, ...s.toasts].slice(0, MAX_TOASTS) },
    ),
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((toast) => toast.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/* --------------------------------------------------------------------------
   What the shop is already looking at

   Toasting an alert about the job on screen is noise: the shop is looking at
   the thing the toast is about. The screens that can be the subject of an
   alert declare themselves here while focused, and the stream checks before it
   interrupts.
   -------------------------------------------------------------------------- */

type ViewingState = {
  /** The job open right now, if any. */
  orderId: string | null;
  /** True while the Alerts tab is focused — every alert is already visible. */
  onAlerts: boolean;
  setOrder: (orderId: string | null) => void;
  setOnAlerts: (onAlerts: boolean) => void;
};

export const useViewing = create<ViewingState>((set) => ({
  orderId: null,
  onAlerts: false,
  setOrder: (orderId) => set({ orderId }),
  setOnAlerts: (onAlerts) => set({ onAlerts }),
}));

/** Whether an incoming alert is worth interrupting for. */
export function shouldToast(
  alert: { orderId?: string },
  viewing: Pick<ViewingState, "orderId" | "onAlerts">,
): boolean {
  if (viewing.onAlerts) return false;
  if (alert.orderId && alert.orderId === viewing.orderId) return false;
  return true;
}
