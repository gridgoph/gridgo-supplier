import NativeSegmentedControl from "@react-native-segmented-control/segmented-control";
import { View } from "react-native";

import { touchTarget, typography } from "@/constants/theme";
import { useThemeColors, useThemeName } from "@/hooks/useTheme";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive technology. */
  accessibilityLabel: string;
};

/**
 * A choice from a small fixed set.
 *
 * Renders the platform control — `UISegmentedControl` on iOS, a faithful
 * recreation on Android — dressed in GRIDGO tokens so it reads as one product
 * in both themes. Segments stay monochrome: the selected one is the accent, not
 * the action yellow, so a screen's single CTA keeps its meaning.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: Props<T>) {
  const colors = useThemeColors();
  const scheme = useThemeName();
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    // The native control does not accept className; the wrapper carries layout
    // and the control itself is styled through its colour props.
    <View accessibilityLabel={accessibilityLabel}>
      <NativeSegmentedControl
        values={options.map((option) => option.label)}
        selectedIndex={selectedIndex}
        onChange={(event) => {
          const index = event.nativeEvent.selectedSegmentIndex;
          const option = options[index];
          if (option) onChange(option.value);
        }}
        appearance={scheme}
        backgroundColor={colors.surfaceVariant}
        tintColor={colors.surface}
        fontStyle={{
          color: colors.textSecondary,
          fontSize: typography.body.fontSize,
          fontFamily: typography.body.fontFamily,
        }}
        activeFontStyle={{
          color: colors.textPrimary,
          fontSize: typography.body.fontSize,
          fontFamily: typography.button.fontFamily,
        }}
        style={{ height: touchTarget }}
      />
    </View>
  );
}
