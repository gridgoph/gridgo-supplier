import { create } from "zustand";

/**
 * One sentence for Sign in to say after a session ended mid-task.
 *
 * A final 401 ends the session from inside `lib/api.ts`, synchronously and
 * before the call throws, and the root `Stack.Protected` guard takes the
 * screen down before that screen can say what was left unfinished. So a task
 * `hold`s its sentence while its call is out and `release`s it once answered;
 * the session's unauthorized handler calls `sessionEnded`, and Sign in draws
 * the held sentence under "Your session ended". Any change of signed-in
 * account drops a held sentence (it belongs to the account that held it), and
 * signing in again clears the shown one. Never carries anything secret: it is
 * shown on a signed-out screen.
 */
type SignInNoticeState = {
  message: string | null;
  held: string | null;
  hold: (message: string) => void;
  release: () => void;
  sessionEnded: () => void;
  /** The signed-in account changed: drops the held sentence. */
  forgetHeld: () => void;
  clear: () => void;
};

export const useSignInNotice = create<SignInNoticeState>((set, get) => ({
  message: null,
  held: null,
  hold: (message) => set({ held: message }),
  release: () => set({ held: null }),
  sessionEnded: () => {
    const { held } = get();
    if (held) set({ message: held, held: null });
  },
  forgetHeld: () => set({ held: null }),
  clear: () => set({ message: null, held: null }),
}));
