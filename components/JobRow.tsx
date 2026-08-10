import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import { formatDeadlineTime } from "@/lib/dates";
import { presentOrderState, primaryAction } from "@/lib/jobState";
import { deadlineUrgency } from "@/lib/urgency";

type Props = {
  job: Order;
  now?: Date;
  onPress: () => void;
};

/**
 * One dense agenda line: when, what, and whose move it is.
 *
 * The job's name gets the full width of the row rather than competing with the
 * status chip for it — a title clipped to "School event flye…" is not something
 * a shop can pick out of a day. Time anchors the left edge, the status and the
 * spec sit underneath.
 *
 * A row is a destination, never an action — accepting or advancing a job always
 * happens on that job's own screen.
 */
export function JobRow({ job, now = new Date(), onPress }: Props) {
  const status = presentOrderState(job.state);
  const urgency = deadlineUrgency(job.promisedDate || job.deadline, now);
  const next = primaryAction(job.state);
  const time = formatDeadlineTime(job.promisedDate || job.deadline);
  const late = urgency.level === "overdue";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${status.label}${late ? ", late" : ""}`}
      className="gg-touch flex-row items-start gap-3 rounded-field border border-outline bg-surface px-3 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <Text
        className={
          late
            ? "w-16 pt-0.5 text-caption font-medium text-error"
            : "w-16 pt-0.5 text-caption text-text-muted"
        }
      >
        {time || "No time"}
      </Text>

      <View className="min-w-0 flex-1 gap-1.5">
        <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
          {job.title}
        </Text>
        <View className="flex-row flex-wrap items-center gap-2">
          {late ? (
            <StatusChip tone="error" label="Late" icon="triangle-alert" />
          ) : (
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          )}
          <Text className="min-w-0 flex-1 text-caption text-text-muted" numberOfLines={1}>
            {job.quantity} × {job.size || "size not set"}
            {next ? ` · ${next.label}` : ""}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
