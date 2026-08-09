import { Minus, Plus } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** "units", "hours" — shown beside the number so it is never bare. */
  unit?: string;
  /** Spoken name of what is being counted. */
  accessibilityLabel: string;
  disabled?: boolean;
};

/**
 * A bounded count.
 *
 * Capacity and turnaround are structured numbers with real limits, so they get
 * a stepper rather than a keyboard that will happily accept 999999. The value
 * is clamped here, so no caller can push an out-of-range number to the API.
 */
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  accessibilityLabel,
  disabled,
}: Props) {
  const colors = useThemeColors();
  const atMin = value <= min;
  const atMax = value >= max;

  function nudge(delta: number) {
    const next = Math.min(max, Math.max(min, value + delta));
    if (next !== value) onChange(next);
  }

  return (
    <View
      className="h-12 flex-row items-center justify-between rounded-field border border-outline bg-surface px-1"
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: value }}
    >
      <StepButton
        icon="minus"
        onPress={() => nudge(-step)}
        disabled={disabled || atMin}
        label={`Decrease ${accessibilityLabel}`}
        color={disabled || atMin ? colors.textMuted : colors.textPrimary}
      />
      <View className="flex-row items-baseline gap-1">
        <Text className="text-h3 text-text-primary">{value}</Text>
        {unit ? <Text className="text-caption text-text-muted">{unit}</Text> : null}
      </View>
      <StepButton
        icon="plus"
        onPress={() => nudge(step)}
        disabled={disabled || atMax}
        label={`Increase ${accessibilityLabel}`}
        color={disabled || atMax ? colors.textMuted : colors.textPrimary}
      />
    </View>
  );
}

function StepButton({
  icon,
  onPress,
  disabled,
  label,
  color,
}: {
  icon: "minus" | "plus";
  onPress: () => void;
  disabled?: boolean;
  label: string;
  color: string;
}) {
  const Icon = icon === "minus" ? Minus : Plus;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className="gg-touch items-center justify-center rounded-field px-3"
      style={({ pressed }) => (pressed && !disabled ? { opacity: 0.6 } : undefined)}
    >
      <Icon size={20} color={color} strokeWidth={2} />
    </Pressable>
  );
}
