import { Text, TextInput, View } from "react-native";

import { singleLineFieldTextStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** The percent as typed, so a half-typed "12." is not mangled. */
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
  editable?: boolean;
};

/** Digits and one decimal point, at most two places; the app owns the percent sign. */
export function sanitizePercentInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (!rest.length) return whole.slice(0, 3);
  return `${whole.slice(0, 3)}.${rest.join("").slice(0, 2)}`;
}

/** A share of a sheet, keyed on the numeric pad. Bounded by whoever reads it. */
export function PercentField({ value, onChange, accessibilityLabel, editable = true }: Props) {
  const colors = useThemeColors();
  return (
    <View className={editable ? "gg-field flex-row items-center" : "gg-field gg-disabled flex-row items-center"}>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(sanitizePercentInput(text))}
        editable={editable}
        keyboardType="decimal-pad"
        inputMode="decimal"
        accessibilityLabel={accessibilityLabel}
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        className="flex-1 text-body text-text-primary"
        style={singleLineFieldTextStyle}
      />
      <Text className="text-body text-text-muted">%</Text>
    </View>
  );
}
