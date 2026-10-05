import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { RescheduleRequest } from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";
import { rescheduleNotice } from "@/lib/reschedule";

/**
 * The job's one deadline request and where it stands.
 *
 * The two dates are the substance, so they are set as a pair the shop can
 * compare at a glance: the ready-by it is held to now in full weight, the
 * other one struck through or muted. The reason is the shop's own words,
 * repeated so it can see what the client read.
 */
export function DeadlineRequestPanel({ request }: { request: RescheduleRequest }) {
  const notice = rescheduleNotice(request);
  const movedTo = notice.holdsTo === request.proposedReadyBy;
  const border = notice.stopped ? " border-warning" : "";
  return (
    <View className={`gg-card gap-3${border}`} testID="deadline-request">
      <View className="flex-row">
        <StatusChip tone={notice.chip.tone} label={notice.chip.label} icon={notice.chip.icon} />
      </View>
      <View className="gap-1">
        <Text className="text-body-lg font-medium text-text-primary">{notice.title}</Text>
        <Text className="text-body text-text-secondary">{notice.body}</Text>
      </View>
      <View className="gap-2 rounded-field border border-outline bg-surface-variant p-3">
        <DateRow
          label="Your ready-by"
          value={formatDeadlineFull(request.originalReadyBy)}
          state={movedTo ? "replaced" : "current"}
        />
        <DateRow
          label="You asked for"
          value={formatDeadlineFull(request.proposedReadyBy)}
          state={movedTo ? "current" : "proposed"}
        />
      </View>
      {request.reason ? (
        <View className="gap-0.5">
          <Text className="text-caption text-text-muted">Your reason, as the client read it</Text>
          <Text className="text-body text-text-secondary">{request.reason}</Text>
        </View>
      ) : null}
    </View>
  );
}

function DateRow({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: "current" | "replaced" | "proposed";
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className="text-caption text-text-muted">{label}</Text>
      <Text
        className={
          state === "current"
            ? "text-body font-medium text-text-primary"
            : state === "replaced"
              ? "text-body text-text-muted line-through"
              : "text-body text-text-secondary"
        }
        accessibilityLabel={state === "replaced" ? `${value}, replaced` : value}
      >
        {value}
      </Text>
    </View>
  );
}
