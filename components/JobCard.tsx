import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineFull } from "@/lib/dates";
import { formatPhp, type Order } from "@/lib/api";
import { presentOrderState } from "@/lib/jobState";

type Props = {
  job: Order;
  onPress?: () => void;
  /** Optional footer (actions live on the detail screen to protect the yellow budget). */
  footer?: ReactNode;
  /** Show a short spec block under the title. */
  showSpec?: boolean;
};

/**
 * One assigned job in a list. Status is icon + label + colour. Yellow never
 * repeats across a list of cards — the CTA lives on the job workspace.
 */
export function JobCard({ job, onPress, footer, showSpec = true }: Props) {
  const status = presentOrderState(job.state);
  const content = (
    <View className="gg-card gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2}>
            {job.title}
          </Text>
          <Text className="text-caption text-text-muted">
            Due {formatDeadlineFull(job.deadline || job.promisedDate)}
          </Text>
        </View>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </View>

      {showSpec ? (
        <View>
          <SpecRow label="Size" value={job.size || "—"} />
          <SpecRow label="Material" value={job.material || "—"} />
          <SpecRow label="Quantity" value={String(job.quantity)} />
          <SpecRow label="Print total" value={formatPhp(job.totalMinor)} />
        </View>
      ) : null}

      {footer}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${status.label}`}
      className="gg-touch"
    >
      {({ pressed }) => (
        <View className={pressed ? "opacity-90" : undefined}>{content}</View>
      )}
    </Pressable>
  );
}
