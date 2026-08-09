import { Text, TextInput, View } from "react-native";

import { sanitizeMoneyInput } from "@/lib/money";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** Pesos as typed. Kept as a string so a half-typed "12." is not mangled. */
  value: string;
  onChange: (value: string) => void;
  accessibilityLabel: string;
  editable?: boolean;
};

/**
 * A peso amount, entered explicitly and bounded by `parseMoney`.
 *
 * The peso sign belongs to the app, the keypad is numeric, and anything that is
 * not a digit or a decimal point never reaches the value.
 */
export function MoneyField({ value, onChange, accessibilityLabel, editable = true }: Props) {
  const colors = useThemeColors();

  return (
    <View
      className={
        editable
          ? "gg-field flex-row items-center gap-2"
          : "gg-field gg-disabled flex-row items-center gap-2"
      }
    >
      <Text className="text-body text-text-muted">₱</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(sanitizeMoneyInput(text))}
        editable={editable}
        keyboardType="decimal-pad"
        inputMode="decimal"
        accessibilityLabel={accessibilityLabel}
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
        className="flex-1 text-body text-text-primary"
      />
    </View>
  );
}
