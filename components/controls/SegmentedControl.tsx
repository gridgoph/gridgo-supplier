import { Pressable, Text, View } from "react-native";

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

type Props<T extends string> = {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for assistive technology. */
  accessibilityLabel: string;
  disabled?: boolean;
};

/**
 * A choice from a small fixed set.
 *
 * Built from GRIDGO tokens rather than the platform segmented control. That
 * component draws its own geometry from the OS — iOS keeps `UISegmentedControl`'s
 * continuous rounding and Android's recreation hard-codes a 9pt track with a 7pt
 * slider — so on a screen of 12pt fields it read as a control borrowed from
 * another app, and differently borrowed on each platform. Colour props could not
 * reach that; only owning the geometry can. The behaviour underneath is a radio
 * group, which is small enough to owe the native implementation nothing. The
 * rider app made the same call, so all three GRIDGO apps now speak one control
 * language.
 *
 * The track is a 12pt field. The selected segment is 8pt — 12 less the 4pt
 * padding — so the two curves stay concentric instead of nesting two 12s.
 *
 * Selection is said three ways: a lifted surface, a bold label, and a darker
 * ink. It survives greyscale, and it stays monochrome so the screen's one
 * yellow action keeps its meaning.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: Props<T>) {
  return (
    <View
      className="flex-row gap-1 rounded-field border border-outline bg-surface-variant p-1"
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
            className={
              selected
                ? "min-h-11 flex-1 items-center justify-center rounded-sm border border-outline bg-surface-high px-2 py-2"
                : "min-h-11 flex-1 items-center justify-center rounded-sm px-2 py-2"
            }
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text
              numberOfLines={2}
              className={
                selected
                  ? "text-center text-button text-text-primary"
                  : "text-center text-body text-text-secondary"
              }
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
