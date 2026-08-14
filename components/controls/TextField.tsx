import { TextInput, View, type TextInputProps } from "react-native";

import { singleLineFieldTextStyle } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  /** Picks the keyboard, autofill and capitalisation the field really needs. */
  kind?: "email" | "password" | "new-password" | "phone" | "name" | "text";
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
  const secure = kind === "password" || kind === "new-password";

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
        autoCapitalize={CAPITALIZE[kind]}
        autoCorrect={kind === "text"}
        autoComplete={AUTOCOMPLETE[kind]}
        keyboardType={KEYBOARD[kind]}
        secureTextEntry={secure}
        textContentType={CONTENT_TYPE[kind]}
        className="gg-field"
        style={singleLineFieldTextStyle}
      />
    </View>
  );
}

type Kind = NonNullable<Props["kind"]>;

/**
 * Each kind's four platform hints, kept together so a new one cannot be added
 * with the keyboard set and the autofill forgotten.
 *
 * `new-password` matters on its own: on iOS a field marked `password` offers
 * the saved one, which is exactly wrong on a screen where someone is choosing a
 * password for an account that does not exist yet.
 */
const CAPITALIZE: Record<Kind, TextInputProps["autoCapitalize"]> = {
  email: "none",
  password: "none",
  "new-password": "none",
  phone: "none",
  name: "words",
  text: "sentences",
};

const AUTOCOMPLETE: Record<Kind, TextInputProps["autoComplete"]> = {
  email: "email",
  password: "current-password",
  "new-password": "new-password",
  phone: "tel",
  name: "name",
  text: "off",
};

const KEYBOARD: Record<Kind, TextInputProps["keyboardType"]> = {
  email: "email-address",
  password: "default",
  "new-password": "default",
  phone: "phone-pad",
  name: "default",
  text: "default",
};

const CONTENT_TYPE: Record<Kind, TextInputProps["textContentType"]> = {
  email: "emailAddress",
  password: "password",
  "new-password": "newPassword",
  phone: "telephoneNumber",
  name: "name",
  text: "none",
};
