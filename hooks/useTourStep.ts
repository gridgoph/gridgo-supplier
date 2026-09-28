import { visibleStep, type TourStepId } from "@/lib/tour";
import { useSession } from "@/store/session";
import { useTour } from "@/store/tour";

/*
 * Kept apart from `useTourScreen` so the overlay and its targets never load
 * expo-router: they read the store, nothing else.
 */

/** The step the overlay is drawing right now, for this account, on this screen. */
export function useVisibleTourStep() {
  const accountId = useSession((s) => s.user?.id ?? null);
  const progress = useTour((s) => (accountId ? s.progress[accountId] : undefined));
  const screen = useTour((s) => s.screen);
  return { accountId, progress, step: visibleStep(progress, screen) };
}

/** Whether `id` is the step being drawn, so its target knows to measure. */
export function useTourStepActive(id: TourStepId): boolean {
  return useVisibleTourStep().step?.id === id;
}
