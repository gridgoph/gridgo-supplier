import { Circle, CircleDot } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

export type Option<T extends string> = {
  value: T;
  label: string;
  /** One line of consequence, where the choice needs it. */
  detail?: string;
};

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  accessibilityLabel: string;
};

/**
 * One choice from a fixed list, all options visible at once.
 *
 * Used where a segmented control would truncate the labels and a dropdown would
 * hide them: a decline reason has to be read before it is picked, because it is
 * what Operations and the client will see.
 */
export function OptionList<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const colors = useThemeColors();

  return (
    <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={accessibilityLabel}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={option.label}
            className={
              selected
                ? "gg-touch flex-row items-start gap-3 rounded-field border border-accent bg-surface px-3 py-3"
                : "gg-touch flex-row items-start gap-3 rounded-field border border-outline bg-surface px-3 py-3"
            }
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            {selected ? (
              <CircleDot size={20} color={colors.accent} strokeWidth={2} />
            ) : (
              <Circle size={20} color={colors.textMuted} strokeWidth={2} />
            )}
            <View className="min-w-0 flex-1">
              <Text
                className={
                  selected
                    ? "text-body font-medium text-text-primary"
                    : "text-body text-text-secondary"
                }
              >
                {option.label}
              </Text>
              {option.detail ? (
                <Text className="mt-0.5 text-caption text-text-muted">{option.detail}</Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
