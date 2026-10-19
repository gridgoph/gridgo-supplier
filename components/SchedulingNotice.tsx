import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import type { Order } from "@/lib/api";
import {
  isTightBeforeAccepting,
  sameDayReadyLine,
  TIGHT_DEADLINE_LABEL,
  TIGHT_DEADLINE_LINE,
} from "@/lib/scheduling";

type Props = {
  order: Pick<Order, "state" | "shopRecovery" | "scheduling" | "readyBy">;
  /** One line under the badge on a list card; the full sentence elsewhere. */
  compact?: boolean;
};

/**
 * A Tight or same-day job, said before the shop answers it.
 *
 * The badge is a warning, not a stop: the shop can still accept. The line
 * under it says the one thing that makes Tight different — declining with a
 * reason costs nothing during the pilot. Draws nothing for a job that is
 * neither, or for a GRIDGO that sends no `scheduling`.
 */
export function SchedulingNotice({ order, compact = false }: Props) {
  const tight = isTightBeforeAccepting(order);
  const sameDay = sameDayReadyLine(order);
  if (!tight && !sameDay) return null;

  return (
    <View className="gap-1.5" testID="scheduling-notice">
      {tight ? (
        <View className="flex-row">
          <StatusChip tone="warning" label={TIGHT_DEADLINE_LABEL} icon="clock" />
        </View>
      ) : null}
      {sameDay ? <Text className="text-body font-medium text-text-primary">{sameDay}</Text> : null}
      {tight && !compact ? (
        <Text className="text-body text-text-secondary">{TIGHT_DEADLINE_LINE}</Text>
      ) : null}
    </View>
  );
}
