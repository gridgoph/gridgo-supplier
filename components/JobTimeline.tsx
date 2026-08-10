import { Text, View } from "react-native";

import type { Order } from "@/lib/api";
import { formatTimelineAt } from "@/lib/dates";
import {
  presentTimelineActor,
  presentTimelineNote,
  presentTimelineState,
} from "@/lib/jobState";

type Props = {
  timeline: Order["timeline"];
};

/**
 * Chronological accountability: who moved the job, when, and to what state.
 * Ordering carries real meaning — newest last so the current state sits at
 * the bottom where the eye rests after reading the story.
 */
export function JobTimeline({ timeline }: Props) {
  if (!timeline.length) {
    return (
      <Text className="text-body text-text-muted">No timeline events yet for this job.</Text>
    );
  }

  return (
    <View className="gap-0">
      {timeline.map((entry, index) => {
        const isLast = index === timeline.length - 1;
        return (
          <View key={`${entry.at}-${entry.state}-${index}`} className="flex-row gap-3">
            <View className="items-center">
              <View
                className={
                  isLast
                    ? "mt-1 h-2.5 w-2.5 rounded-pill bg-accent"
                    : "mt-1 h-2.5 w-2.5 rounded-pill border border-outline bg-surface"
                }
              />
              {!isLast ? <View className="w-px flex-1 bg-outline-subtle" /> : null}
            </View>
            <View className={`min-w-0 flex-1 pb-4 ${isLast ? "pb-0" : ""}`}>
              <Text className="text-body font-medium text-text-primary">
                {presentTimelineState(entry.state)}
              </Text>
              <Text className="mt-0.5 text-caption text-text-muted">
                {formatTimelineAt(entry.at)} · {presentTimelineActor(entry.by)}
              </Text>
              {entry.note ? (
                <Text className="mt-1 text-body text-text-secondary">
                  {presentTimelineNote(entry.note)}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}
