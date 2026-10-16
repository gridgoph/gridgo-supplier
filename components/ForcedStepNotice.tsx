import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { formatTimelineAt } from "@/lib/dates";
import { FORCED_TAG, type ForcedStepView } from "@/lib/shopHandover";

type Props = {
  steps: ForcedStepView[];
};

/**
 * A step GRIDGO forced on this job past a missing check, with the reason it
 * gave (gridgo-api `docs/SHOP_HANDOVER_API.md#forced-steps-and-audit`).
 *
 * Only Operations forces a step, and never without a reason, so the shop is
 * told what was skipped and why rather than finding its job moved without
 * explanation. It is a record, not a fault of the shop's: neutral, no yellow,
 * and the reason is GRIDGO's own words. A forced step invents no evidence —
 * the rider still checks the job at the counter.
 */
export function ForcedStepNotice({ steps }: Props) {
  if (!steps.length) {
    return (
      <View className="gg-panel gap-2" testID="forced-step">
        <View className="flex-row">
          <StatusChip tone="neutral" label={FORCED_TAG} icon="wrench" />
        </View>
        <Text className="text-body text-text-secondary">
          Operations moved a step on this job past a missing check. The rider still checks the job at the counter.
        </Text>
      </View>
    );
  }
  return (
    <View className="gg-panel gap-4" testID="forced-step">
      <View className="flex-row">
        <StatusChip tone="neutral" label={FORCED_TAG} icon="wrench" />
      </View>
      {steps.map((step) => (
        <View key={step.key} className="gap-1">
          <Text className="text-body font-medium text-text-primary">
            {step.toPickup ? "Moved on to rider pickup" : "Moved on to GRIDGO's review"}
          </Text>
          <Text className="text-caption text-text-muted">
            {step.at ? `${step.reason}, ${formatTimelineAt(step.at)}` : step.reason}
          </Text>
          {step.note ? <Text className="text-body text-text-secondary">“{step.note}”</Text> : null}
          {step.skipped.length ? (
            <Text className="text-caption text-text-muted">Skipped: {step.skipped.join(", ")}</Text>
          ) : null}
        </View>
      ))}
      <Text className="text-caption text-text-muted">
        Operations moved this on, with the reason above. The rider still checks the job at the counter.
      </Text>
    </View>
  );
}
