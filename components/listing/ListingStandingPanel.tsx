import { Text, View } from "react-native";

import { StandingChips } from "@/components/listing/StandingChips";
import { standingSince } from "@/lib/listingReview";
import type { BoardStanding } from "@/lib/listings";

/**
 * Where a listing stands, at the top of its editor.
 *
 * The chips say the state; under them, the decision that put it there. A
 * reason from GRIDGO or Operations is drawn as a slip of its own, quoted as
 * written and dated, because it is the one thing on this screen the shop did
 * not write and has to act on.
 */
export function ListingStandingPanel({ standing }: { standing: BoardStanding }) {
  const decision = decisionOf(standing);

  return (
    <View className="gap-3">
      <StandingChips standing={standing} />
      {decision ? (
        <View
          className={
            decision.tone === "error"
              ? "gap-1 rounded-card border border-error bg-surface p-4"
              : "gap-1 rounded-card border border-warning bg-surface p-4"
          }
        >
          <Text className="text-caption font-medium text-text-muted">{decision.heading}</Text>
          <Text className="text-body-lg text-text-primary">{decision.reason}</Text>
          {decision.since ? (
            <Text className="text-caption text-text-muted">{decision.since}</Text>
          ) : null}
        </View>
      ) : null}
      {standing.note ? (
        <Text className="text-body text-text-secondary">{standing.note}</Text>
      ) : null}
      {standing.revision ? (
        <Text className="text-body text-text-secondary">{standing.revision.note}</Text>
      ) : null}
    </View>
  );
}

type Decision = {
  heading: string;
  reason: string;
  since: string | null;
  tone: "error" | "warning";
};

function decisionOf(standing: BoardStanding): Decision | null {
  if (standing.kind === "suspended") {
    return {
      heading: "Why GRIDGO took it down",
      reason: standing.reason ?? "GRIDGO did not give a reason. Ask Operations in chat.",
      since: standingSince("Taken down", standing.since),
      tone: "error",
    };
  }
  if (standing.kind === "needs_changes" && standing.reason) {
    return {
      heading: "What Operations asked for",
      reason: standing.reason,
      since: standingSince("Sent back", standing.since),
      tone: "warning",
    };
  }
  if (standing.revision?.kind === "needs_changes" && standing.revision.reason) {
    return {
      heading: "What Operations asked for",
      reason: standing.revision.reason,
      since: null,
      tone: "warning",
    };
  }
  return null;
}
