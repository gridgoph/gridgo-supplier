import { create } from "zustand";

/**
 * One sentence for Sign in to say after a session ended mid-task.
 *
 * A final 401 ends the session from inside `lib/api.ts`, and the root
 * `Stack.Protected` guard takes the screen down before that screen can say
 * what was left unfinished. The screen leaves its sentence here instead, and
 * Sign in draws it under "Your session ended". Signing in again clears it.
 * Never carries anything secret: it is shown on a signed-out screen.
 */
type SignInNoticeState = {
  message: string | null;
  say: (message: string) => void;
  clear: () => void;
};

export const useSignInNotice = create<SignInNoticeState>((set) => ({
  message: null,
  say: (message) => set({ message }),
  clear: () => set({ message: null }),
}));
