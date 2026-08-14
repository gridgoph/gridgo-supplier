import { Text, TextInput, View } from "react-native";

import { multilineFieldTextStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  maxLength?: number;
};

/**
 * Free text, where the content genuinely is free text.
 *
 * A shop explaining a delay in its own words is not structured data and must
 * not be forced into a taxonomy. The counter is the only structure: it says how
 * much room is left before the shop runs out of it.
 */
export function NoteField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  maxLength = 240,
}: Props) {
  const colors = useThemeColors();
  const remaining = maxLength - value.length;

  return (
    <View className="gap-1">
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel}
        multiline
        maxLength={maxLength}
        className="min-h-24 rounded-field border border-outline bg-surface py-3 text-body text-text-primary"
        style={multilineFieldTextStyle}
      />
      {remaining <= 40 ? (
        <Text className="text-caption text-text-muted">
          {remaining} character{remaining === 1 ? "" : "s"} left
        </Text>
      ) : null}
    </View>
  );
}
