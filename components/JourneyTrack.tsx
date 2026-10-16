import { Text, View } from "react-native";

import { JOB_JOURNEY, journeyIndex, journeyLabel } from "@/lib/jobState";
import type { HandoverFlow } from "@/lib/shopHandover";

type Props = {
  state: string;
  /** The job's handover: on the newer one, packing belongs to the pickup step. */
  flow?: HandoverFlow;
};

/**
 * Where the job stands in the shop's sequence, and how much is left.
 *
 * A job really does move through these steps in order, so numbering it is
 * honest. The track stays monochrome: the screen's one yellow element is its
 * primary action, never a progress bar.
 */
export function JourneyTrack({ state, flow = "legacy" }: Props) {
  const index = journeyIndex(state);
  if (index < 0) return null;

  const label = journeyLabel(JOB_JOURNEY[index].id, flow);
  const total = JOB_JOURNEY.length;

  return (
    <View
      className="gap-2"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      accessibilityLabel={`Step ${index + 1} of ${total}, ${label}`}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-overline text-text-muted">
          STEP {index + 1} OF {total}
        </Text>
        <Text className="text-caption font-medium text-text-primary">{label}</Text>
      </View>
      <View className="flex-row gap-1" aria-hidden>
        {JOB_JOURNEY.map((entry, i) => (
          <View
            key={entry.id}
            className={
              i <= index
                ? "h-1 flex-1 rounded-pill bg-accent"
                : "h-1 flex-1 rounded-pill bg-outline"
            }
          />
        ))}
      </View>
    </View>
  );
}
