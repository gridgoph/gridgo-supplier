import { Eye, EyeOff } from "lucide-react-native";
import { useState } from "react";
import { Pressable, TextInput, View, type TextInputProps } from "react-native";

import { singleLineFieldTextStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Saved-password autofill. New accounts use `new-password` instead. */
  kind?: "password" | "new-password";
  onSubmit?: () => void;
  returnKeyType?: TextInputProps["returnKeyType"];
  editable?: boolean;
};

/**
 * A password field with a show/hide control.
 *
 * Mistyped phone keyboards are the common failure, and without a reveal the
 * only recovery is to clear the field and try again blind. The control is a
 * 44×44 target on the trailing edge so a thumb can reach it one-handed; the
 * text keeps its own padding so the icon never covers what it is meant to help
 * read. Toggling flips `secureTextEntry` on the same input — it does not
 * remount — so the keyboard, focus and caret stay put. The form scroll surface
 * already uses `keyboardShouldPersistTaps="handled"`, so the press does not
 * dismiss the keyboard on its way through.
 *
 * Default is hidden. Revealing is the deliberate act. The accessible name
 * changes with state ("Show password" / "Hide password").
 */
export function PasswordField({
  value,
  onChange,
  placeholder,
  accessibilityLabel,
  kind = "password",
  onSubmit,
  returnKeyType,
  editable = true,
}: Props) {
  const colors = useThemeColors();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  const toggleLabel = visible ? "Hide password" : "Show password";

  return (
    <View
      className={
        editable
          ? "gg-field flex-row items-center"
          : "gg-field gg-disabled flex-row items-center"
      }
    >
      <TextInput
        value={value}
        onChangeText={onChange}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={accessibilityLabel}
        onSubmitEditing={onSubmit}
        returnKeyType={returnKeyType}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={kind === "new-password" ? "new-password" : "current-password"}
        textContentType={kind === "new-password" ? "newPassword" : "password"}
        secureTextEntry={!visible}
        // Room for the trailing control so glyphs never sit under the icon.
        className="min-w-0 flex-1 text-body text-text-primary"
        style={singleLineFieldTextStyle}
      />
      <Pressable
        onPress={() => setVisible((current) => !current)}
        disabled={!editable}
        accessibilityRole="button"
        accessibilityLabel={toggleLabel}
        accessibilityState={{ disabled: !editable }}
        hitSlop={4}
        className="gg-touch items-center justify-center"
        style={({ pressed }) => (pressed && editable ? { opacity: 0.7 } : undefined)}
      >
        <Icon size={20} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
