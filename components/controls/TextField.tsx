import { TextInput, View, type TextInputProps } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Picks the keyboard, autofill and capitalisation the field really needs. */
  kind?: "email" | "password" | "text";
  onSubmit?: () => void;
  returnKeyType?: TextInputProps["returnKeyType"];
  editable?: boolean;
};

/**
 * A single line of text.
 *
 * The kind decides the keyboard and the autofill hint, so an email field never
 * opens a capitalising keyboard and a password never offers to autocorrect.
 */
export function TextField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  kind = "text",
  onSubmit,
  returnKeyType,
  editable = true,
}: Props) {
  const colors = useThemeColors();

  return (
    <View className={editable ? undefined : "gg-disabled"}>
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel}
        onSubmitEditing={onSubmit}
        returnKeyType={returnKeyType}
        autoCapitalize={kind === "text" ? "sentences" : "none"}
        autoCorrect={kind === "text"}
        autoComplete={
          kind === "email" ? "email" : kind === "password" ? "current-password" : "off"
        }
        keyboardType={kind === "email" ? "email-address" : "default"}
        secureTextEntry={kind === "password"}
        textContentType={
          kind === "email" ? "emailAddress" : kind === "password" ? "password" : "none"
        }
        className="gg-field"
      />
    </View>
  );
}
