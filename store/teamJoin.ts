import { create } from "zustand";

/**
 * A person on their way into a shop's team.
 *
 * Held across sign-in and account creation, so a link opened or a QR scanned
 * before signing in is still there to claim after. Never persisted: an invite
 * token is a single-use secret, and a phone that restarts asks for it again.
 */
type TeamJoinState = {
  /** The person chose to join a team rather than open a shop. */
  joining: boolean;
  /** An invite token read from a link or QR, not yet claimed. */
  token: string | null;
  startJoining: () => void;
  holdToken: (token: string) => void;
  /** The token was claimed or refused; the intent stays until the person is in. */
  dropToken: () => void;
  clear: () => void;
};

export const useTeamJoin = create<TeamJoinState>((set) => ({
  joining: false,
  token: null,
  startJoining: () => set({ joining: true }),
  holdToken: (token) => set({ joining: true, token }),
  dropToken: () => set({ token: null }),
  clear: () => set({ joining: false, token: null }),
}));

export function isJoiningTeam(): boolean {
  return useTeamJoin.getState().joining;
}
