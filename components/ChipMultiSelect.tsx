import type { ReactNode } from "react";
import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

export type ChipOption = {
  value: string;
  label: string;
  /**
   * What the chip is called out loud, when the visible word is a shorthand the
   * group's heading completes. "Canva" under "Links you accept" is clear on
   * screen and means nothing read on its own.
   */
  accessibilityLabel?: string;
};

type Props = {
  options: ChipOption[];
  selected: string[];
  onToggle: (value: string) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  /** Sits in the wrap after the chips — the plus that finds another type. */
  trailing?: ReactNode;
};

/**
 * Several choices from a fixed set, all visible at once.
 *
 * A shop reads "13oz tarpaulin, mesh banner, vinyl sticker" as a list of things
 * it owns a machine for, so they are laid out as one wrapping group rather than
 * a column of full-width rows — the whole set has to be scannable before any of
 * it is tapped. Selection is a filled accent chip with a tick, never colour
 * alone.
 */
export function ChipMultiSelect({
  options,
  selected,
  onToggle,
  accessibilityLabel,
  disabled,
  trailing,
}: Props) {
  const colors = useThemeColors();

  return (
    <View
      className="flex-row flex-wrap gap-2"
      accessibilityRole="list"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => onToggle(option.value)}
            disabled={disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            className={
              on
                ? "gg-chip gg-touch border-accent bg-accent px-3"
                : "gg-chip gg-touch bg-surface px-3"
            }
            style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : undefined)}
          >
            {on ? (
              <Check size={14} color={colors.accentOn} strokeWidth={2.5} />
            ) : null}
            <Text className={on ? "text-caption text-accent-on" : "text-caption text-text-secondary"}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
      {trailing}
    </View>
  );
}
