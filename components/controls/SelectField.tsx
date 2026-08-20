import { ChevronDown, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  label: string;
  valueLabel: string;
  accessibilityLabel: string;
  onPress: () => void;
  /** `chip` sits in a filter row; `field` is a labelled full-width control. */
  density?: "field" | "chip";
  /** Sits before the value on a chip — sort uses the arrows, not a second chevron. */
  icon?: LucideIcon;
};

/**
 * A closed select. Looks like the other fields; opens a sheet, not a spinner.
 *
 * Native pickers draw the OS's own wheel or dropdown. This app already refused
 * that for the segmented control, and a select is the same decision: GRIDGO
 * owns the field, the sheet owns the list. On the board the chip density drops
 * the overline so kind and sort can sit on one row with the standing chips.
 */
export function SelectField({
  label,
  valueLabel,
  accessibilityLabel,
  onPress,
  density = "field",
  icon: Icon,
}: Props) {
  const colors = useThemeColors();
  const chip = density === "chip";

  return (
    <View className={chip ? undefined : "gap-2"}>
      {chip ? null : <Text className="text-overline text-text-muted">{label}</Text>}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        className={
          chip
            ? "gg-touch max-w-full flex-row items-center gap-1.5 rounded-pill border border-outline bg-surface px-3"
            : "gg-field flex-row items-center justify-between px-3"
        }
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        {Icon ? <Icon size={chip ? 14 : 18} color={colors.textMuted} strokeWidth={2} /> : null}
        <Text
          className={
            chip
              ? "shrink text-caption font-medium text-text-primary"
              : "min-w-0 flex-1 text-body text-text-primary"
          }
          numberOfLines={1}
        >
          {valueLabel}
        </Text>
        {Icon && chip ? null : (
          <ChevronDown size={chip ? 14 : 18} color={colors.textMuted} strokeWidth={2} />
        )}
      </Pressable>
    </View>
  );
}
