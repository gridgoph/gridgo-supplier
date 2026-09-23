import { audio } from "@/constants/audio";
import { playAlertSting } from "@/lib/brandSound";

/**
 * One production-reminder sting per notification id.
 *
 * Push and the live stream can both arrive for the same row. The first one
 * that is actually toasted plays `notification_alert.mp3`; the second does
 * not. A shop already looking at that job, or at Alerts, gets silence.
 */
const played = new Set<string>();

export function shouldPlayProductionNudge(input: {
  type?: string | null;
  id?: string | null;
  toasting: boolean;
}): boolean {
  if (input.type !== "shop_production_inactive" || !input.toasting || !input.id) return false;
  if (played.has(input.id)) return false;
  played.add(input.id);
  return true;
}

export function playProductionNudgeSting(input: {
  type?: string | null;
  id?: string | null;
  toasting: boolean;
}): void {
  if (!shouldPlayProductionNudge(input)) return;
  playAlertSting(audio.nudge);
}

/** Tests only. A process-lifetime set would leak ids between cases. */
export function resetProductionNudgeSounds(): void {
  played.clear();
}
