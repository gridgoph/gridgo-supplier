import { Text, View } from "react-native";

import { JOB_JOURNEY, journeyIndex } from "@/lib/jobState";

type Props = {
  state: string;
};

/**
 * Where the job stands in the shop's sequence, and how much is left.
 *
 * A job really does move through these steps in order, so numbering it is
 * honest. The track stays monochrome: the screen's one yellow element is its
 * primary action, never a progress bar.
 */
export function JourneyTrack({ state }: Props) {
  const index = journeyIndex(state);
  if (index < 0) return null;

  const step = JOB_JOURNEY[index];
  const total = JOB_JOURNEY.length;

  return (
    <View
      className="gap-2"
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: index + 1 }}
      accessibilityLabel={`Step ${index + 1} of ${total}, ${step.label}`}
    >
      <View className="flex-row items-center justify-between gap-3">
        <Text className="text-overline text-text-muted">
          STEP {index + 1} OF {total}
        </Text>
        <Text className="text-caption font-medium text-text-primary">{step.label}</Text>
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
