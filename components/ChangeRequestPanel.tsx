import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { changeNotice, changeStatusLabel, type ChangeRequest } from "@/lib/orderChanges";

type Props = {
  request: ChangeRequest;
  /** The job's other requests, oldest first, said in one line each. */
  earlier?: ChangeRequest[];
};

/**
 * The job's change request and where it stands.
 *
 * The change itself is the substance, so it is set where the eye lands after
 * the chip, with the client's note it answers muted above it. The reason is the
 * shop's own words, repeated so it can see what the client read.
 */
export function ChangeRequestPanel({ request, earlier = [] }: Props) {
  const notice = changeNotice(request);
  return (
    <View className="gg-card gap-3" testID="change-request">
      <View className="flex-row">
        <StatusChip tone={notice.chip.tone} label={notice.chip.label} icon={notice.chip.icon} wrap />
      </View>
      <View className="gap-1">
        <Text className="text-body-lg font-medium text-text-primary">{notice.title}</Text>
        <Text className="text-body text-text-secondary">{notice.body}</Text>
      </View>
      <View className="gap-2 rounded-field border border-outline bg-surface-variant p-3">
        {request.originalInstructions ? (
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">The client asked</Text>
            <Text className="text-body text-text-secondary">{request.originalInstructions}</Text>
          </View>
        ) : null}
        {request.proposedSpec ? (
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">Your change</Text>
            <Text className="text-body font-medium text-text-primary">{request.proposedSpec}</Text>
          </View>
        ) : null}
      </View>
      {notice.money ? <Text className="text-body text-text-primary">{notice.money}</Text> : null}
      {request.reason ? (
        <View className="gap-0.5">
          <Text className="text-caption text-text-muted">Your reason, as the client read it</Text>
          <Text className="text-body text-text-secondary">{request.reason}</Text>
        </View>
      ) : null}
      {earlier.length ? (
        <View className="gap-1 border-t border-outline-subtle pt-3">
          <Text className="text-caption text-text-muted">Earlier requests on this job</Text>
          {earlier.map((row) => (
            <Text key={row.id} className="text-body text-text-secondary">
              {changeStatusLabel(row)}: {row.proposedSpec || "a new time"}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
