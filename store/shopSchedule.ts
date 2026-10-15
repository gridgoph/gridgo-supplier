import { schedulePatch, timeLabel, type Closure, type WeekWindow } from "@/lib/shopHours";
import { askConfirm } from "@/store/sheets";
import { useShopHours } from "@/store/shopHours";

/**
 * Save a new base schedule — the week, the closure dates, or both — asking
 * first when GRIDGO could not keep today's extension through it. Resolves to
 * a refusal message, or null once saved.
 *
 * Kept apart from `store/shopHours.ts` so the session store, which resets that
 * one on sign-out, does not pull the sheet routes (and the router) in with it.
 */
export async function saveSchedule(change: { week?: WeekWindow[]; closures?: Closure[] }): Promise<string | null> {
  const { hours, save } = useShopHours.getState();
  if (!hours) return "Your shop hours are still loading.";
  const { patch, dropsExtension } = schedulePatch(hours, change, new Date());
  if (dropsExtension && hours.todayExtension) {
    const confirmed = await askConfirm({
      question: `Save and end today's extension to ${timeLabel(hours.todayExtension.closesMinute)}?`,
      consequence:
        "With this change GRIDGO cannot keep today's extra hours, so your shop goes back to its usual close today.",
      confirmLabel: "Save and end it",
      cancelLabel: "Keep the extension",
      destructive: true,
    });
    if (!confirmed) return "Nothing was saved. Today's extension is unchanged.";
  }
  const outcome = await save(patch);
  return outcome.ok ? null : outcome.message;
}
