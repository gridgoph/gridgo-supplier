import { create } from "zustand";

import * as api from "@/lib/api";
import type { JobsHandledBy } from "@/lib/teamRoster";

/**
 * The sign-up answer to "Who handles the jobs?" (report F315793B), carried
 * from the moment the account opens to the first floor that can act on it.
 *
 * It is saved to GRIDGO's team settings beside the enrollment rather than in
 * it: the enrollment body is exact, and an older GRIDGO would refuse a field
 * it did not know — failing the whole application over a preference. The save
 * is best effort for the same reason; the Team screen is where it matters.
 */
type TeamSetupState = {
  /** The shop said "me and staff": open the Team screen once, after sign-up. */
  openTeam: boolean;
  consume: () => boolean;
};

export const useTeamSetup = create<TeamSetupState>()((set, get) => ({
  openTeam: false,
  consume: () => {
    const open = get().openTeam;
    if (open) set({ openTeam: false });
    return open;
  },
}));

export function rememberJobsHandledBy(choice: JobsHandledBy): void {
  if (choice !== "me_and_staff") return;
  useTeamSetup.setState({ openTeam: true });
  void api.updateTeamSettings({ jobsHandledBy: choice }).catch(() => undefined);
}
