import { CalendarDays } from "lucide-react-native";
import { Text, View } from "react-native";

import { Stepper } from "@/components/controls/Stepper";
import { useThemeColors } from "@/hooks/useTheme";
import { PRODUCTION_DAYS, clampWindow, readyExampleLine } from "@/lib/productionDays";

/** Shown under the section title wherever a shop sets production time. */
export const PRODUCTION_DAYS_HINT =
  "Working days, on your shop's open hours. The soonest you can finish, and the latest you will take.";

type Props = {
  minDays: number;
  maxDays: number;
  onChange: (window: { minDays: number; maxDays: number }) => void;
  /** Fixed in tests; a shop always sees today. */
  now?: Date;
};

/**
 * The soonest and latest a listing takes, in working days, with the date a job
 * started now would be ready — so "2" reads as Thursday, not as a number to
 * guess at. Both steppers keep the pair in order: raising the soonest past the
 * latest carries the latest with it.
 */
export function ProductionDaysField({ minDays, maxDays, onChange, now }: Props) {
  const colors = useThemeColors();
  const window = clampWindow(minDays, maxDays);

  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="text-caption text-text-secondary">Soonest</Text>
        <Stepper
          value={window.minDays}
          onChange={(value) => onChange(clampWindow(value, Math.max(value, window.maxDays)))}
          min={PRODUCTION_DAYS.min}
          max={PRODUCTION_DAYS.max}
          unit={dayUnit(window.minDays)}
          accessibilityLabel="Minimum production time in working days"
        />
      </View>
      <View className="gap-2">
        <Text className="text-caption text-text-secondary">Latest</Text>
        <Stepper
          value={window.maxDays}
          onChange={(value) => onChange(clampWindow(Math.min(window.minDays, value), value))}
          min={PRODUCTION_DAYS.min}
          max={PRODUCTION_DAYS.max}
          unit={dayUnit(window.maxDays)}
          accessibilityLabel="Maximum production time in working days"
        />
      </View>
      <View className="gg-panel flex-row gap-3 p-3" accessibilityRole="summary">
        <CalendarDays size={18} color={colors.textSecondary} strokeWidth={2} />
        <View className="flex-1 gap-1">
          <Text className="text-body text-text-primary">
            {readyExampleLine(window.minDays, window.maxDays, now ?? new Date())}
          </Text>
          <Text className="text-caption text-text-muted">
            Days you are closed don&rsquo;t count. Jobs already ahead of it can push it later.
          </Text>
        </View>
      </View>
    </View>
  );
}

function dayUnit(days: number): string {
  return days === 1 ? "working day" : "working days";
}
