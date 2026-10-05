import { View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { BoardStanding } from "@/lib/listings";

/**
 * A listing's state as chips: the state itself, and beside it a revision that
 * is with Operations while clients keep the approved version ("Live" and
 * "Pending review"). Wraps rather than truncates, so a long label never hides
 * the second chip on a narrow tile.
 */
export function StandingChips({ standing }: { standing: BoardStanding }) {
  return (
    <View className="flex-row flex-wrap gap-1.5">
      <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} />
      {standing.revision ? (
        <StatusChip
          tone={standing.revision.tone}
          icon={standing.revision.icon}
          label={standing.revision.label}
        />
      ) : null}
    </View>
  );
}

/** The one line a tile or row shows under its chips, or null when the chip says it all. */
export function standingCaption(standing: BoardStanding): string | null {
  if (standing.kind === "suspended" || standing.kind === "needs_changes") {
    return standing.reason ? `Reason: ${standing.reason}` : standing.note;
  }
  if (standing.kind === "not_ready") return standing.note;
  if (standing.revision?.kind === "needs_changes") {
    return standing.revision.reason ? `Reason: ${standing.revision.reason}` : standing.revision.note;
  }
  return null;
}
