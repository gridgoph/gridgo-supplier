import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { FieldShell } from "@/components/controls/FieldShell";
import { Stepper } from "@/components/controls/Stepper";
import type { SupplierService, Taxonomy } from "@/lib/api";
import {
  CAPACITY_BOUNDS,
  presentServiceState,
  type CapacityDraft,
} from "@/lib/capacity";

type Props = {
  service: SupplierService;
  taxonomy: Taxonomy | null;
  draft: CapacityDraft;
  onChange: (patch: Partial<CapacityDraft>) => void;
  /** Names what is wrong with these three numbers, if anything. */
  error: string | null;
  disabled: boolean;
};

/**
 * Capacity for one accredited service line.
 *
 * These numbers are what GRIDGO matches work against, so they are edited with
 * bounded steppers rather than a keyboard — a mistyped 200 instead of 20 would
 * quietly oversell the shop for a week. Saving is one action for the whole
 * screen, so this card carries no button of its own.
 */
export function ServiceCapacityCard({
  service,
  taxonomy,
  draft,
  onChange,
  error,
  disabled,
}: Props) {
  const categoryName =
    taxonomy?.categories.find((c) => c.code === service.categoryCode)?.name ?? "Service line";
  const live = service.state === "live";

  return (
    <View className="gg-card gap-4">
      <View className="gap-2">
        <Text className="text-h3 text-text-primary">{categoryName}</Text>
        <View className="flex-row">
          <StatusChip
            tone={live ? "success" : "neutral"}
            label={presentServiceState(service.state)}
            icon={live ? "circle-check" : "clock"}
          />
        </View>
        {!live ? (
          <Text className="text-caption text-text-muted">
            GRIDGO does not route new work to this line yet. Your capacity is kept for when it
            does.
          </Text>
        ) : null}
      </View>

      <FieldShell
        label="Units per day"
        hint={`What this line can finish in a day, up to ${CAPACITY_BOUNDS.daily.max}.`}
      >
        <Stepper
          value={draft.capacityDaily}
          onChange={(capacityDaily) => onChange({ capacityDaily })}
          min={CAPACITY_BOUNDS.daily.min}
          max={CAPACITY_BOUNDS.daily.max}
          step={CAPACITY_BOUNDS.daily.step}
          unit="units"
          accessibilityLabel={`Daily capacity for ${categoryName}`}
          disabled={disabled}
        />
      </FieldShell>

      <FieldShell label="Units per week" hint="Keep this at or above the daily figure.">
        <Stepper
          value={draft.capacityWeekly}
          onChange={(capacityWeekly) => onChange({ capacityWeekly })}
          min={CAPACITY_BOUNDS.weekly.min}
          max={CAPACITY_BOUNDS.weekly.max}
          step={CAPACITY_BOUNDS.weekly.step}
          unit="units"
          accessibilityLabel={`Weekly capacity for ${categoryName}`}
          disabled={disabled}
        />
      </FieldShell>

      <FieldShell
        label="Turnaround"
        hint="From accepting a job to having it packed."
        error={error}
      >
        <Stepper
          value={draft.turnaroundHours}
          onChange={(turnaroundHours) => onChange({ turnaroundHours })}
          min={CAPACITY_BOUNDS.turnaround.min}
          max={CAPACITY_BOUNDS.turnaround.max}
          unit="hours"
          accessibilityLabel={`Turnaround hours for ${categoryName}`}
          disabled={disabled}
        />
      </FieldShell>
    </View>
  );
}
