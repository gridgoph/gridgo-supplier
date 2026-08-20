import { router } from "expo-router";
import { InteractionManager } from "react-native";
import { create } from "zustand";

/**
 * Sheets the app asks for and waits on.
 *
 * A confirmation and a date picker are routes, not overlays drawn on top of a
 * screen: presenting them through the navigator is what buys the platform's own
 * sheet physics, drag-to-dismiss, back gesture and scrim, and what makes a
 * screen reader land inside the sheet instead of behind it.
 *
 * A caller awaits the answer — `const ok = await askConfirm(...)` — so the
 * call site reads as one decision rather than three pieces of visibility state.
 * Dismissing a sheet any way the platform allows resolves it as declined, which
 * is always the safe outcome: nothing is committed until the sheet's own action
 * is pressed.
 */

export type ConfirmRequest = {
  /** A specific question naming the thing: "Decline Grand opening tarpaulin?" */
  question: string;
  /** What happens next, in one or two sentences. */
  consequence: string;
  /** The verb that goes ahead. Matches the verb that opened the sheet. */
  confirmLabel: string;
  /** The verb that backs out. Never a bare "Cancel" for a destructive choice. */
  cancelLabel: string;
  destructive?: boolean;
};

export type DateRequest = {
  /** What is being chosen: "Promised finish". */
  title: string;
  mode: "date" | "datetime";
  /** ISO strings — a Date is not safe to hold across a navigation. */
  initial: string | null;
  minimum?: string;
  maximum?: string;
  confirmLabel: string;
};

type Pending<TRequest, TResult> = {
  request: TRequest;
  resolve: (value: TResult) => void;
  settled: boolean;
} | null;

export type PickOption = {
  value: string;
  label: string;
  detail?: string;
};

export type PickRequest = {
  /** What is being chosen: "Kind of work". */
  title: string;
  body?: string;
  options: PickOption[];
  selected: string | null;
  cancelLabel?: string;
};

type SheetState = {
  confirm: Pending<ConfirmRequest, boolean>;
  date: Pending<DateRequest, string | null>;
  pick: Pending<PickRequest, string | null>;
};

export const useSheets = create<SheetState>(() => ({
  confirm: null,
  date: null,
  pick: null,
}));

/**
 * Ask the question, wait for the answer.
 *
 * Resolves false when the sheet is dismissed by drag, back gesture, scrim tap,
 * or the cancel action — every one of those means "not this time".
 */
/**
 * Wait until a native sheet has actually left.
 *
 * `router.back()` only *asks* the sheet to dismiss. On Android the wall
 * underneath is still a live native tree while that animation runs, and taking
 * photo tiles out of it in that moment crashed the project (the OS reported
 * that a view already had a parent). Callers continue only after the
 * interaction queue drains.
 */
export function afterNativePresentation(): Promise<void> {
  return new Promise((resolve) => {
    const finish = () => {
      InteractionManager.runAfterInteractions(() => resolve());
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(finish));
    } else {
      finish();
    }
  });
}

export function askConfirm(request: ConfirmRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    useSheets.setState({ confirm: { request, resolve, settled: false } });
    router.push("/confirm");
  }).then(async (answer) => {
    await afterNativePresentation();
    return answer;
  });
}

/** Resolve the open confirmation. Safe to call more than once. */
export function settleConfirm(answer: boolean): void {
  const pending = useSheets.getState().confirm;
  if (!pending || pending.settled) return;
  useSheets.setState({ confirm: { ...pending, settled: true } });
  pending.resolve(answer);
}

/** Ask for a date (and time). Resolves null when the sheet is dismissed. */
export function askDate(request: DateRequest): Promise<Date | null> {
  return new Promise<string | null>((resolve) => {
    useSheets.setState({ date: { request, resolve, settled: false } });
    router.push("/pick-date");
  }).then((iso) => {
    if (!iso) return null;
    const parsed = new Date(iso);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  });
}

export function settleDate(iso: string | null): void {
  const pending = useSheets.getState().date;
  if (!pending || pending.settled) return;
  useSheets.setState({ date: { ...pending, settled: true } });
  pending.resolve(iso);
}

/** Ask the shop to pick one of a short list. Resolves null when dismissed. */
export function askPick(request: PickRequest): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    useSheets.setState({ pick: { request, resolve, settled: false } });
    router.push("/pick");
  }).then(async (value) => {
    await afterNativePresentation();
    return value;
  });
}

export function settlePick(value: string | null): void {
  const pending = useSheets.getState().pick;
  if (!pending || pending.settled) return;
  useSheets.setState({ pick: { ...pending, settled: true } });
  pending.resolve(value);
}
