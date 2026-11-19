import { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

const LENGTH = 6;

type Props = {
  value: string;
  onChange: (value: string) => void;
  /** The keyboard's done key, once all six are in. */
  onSubmit?: () => void;
  /** False while a check is on its way, or while the counter is locked. */
  editable?: boolean;
  /** Draw every box in the error colour (a refused code). */
  invalid?: boolean;
  /** Offer the phone's one-time-code autofill (an emailed code, never a client's). */
  oneTimeCode?: boolean;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  testID?: string;
};

/**
 * Six digit boxes over one native field.
 *
 * The boxes are the product surface. The hidden field sits on top so the
 * platform's number pad, paste and (for emailed codes) autofill all work — a
 * second visible field would steal them. Yellow is spent on the current box.
 */
export function DigitBoxes({
  value,
  onChange,
  onSubmit,
  editable = true,
  invalid = false,
  oneTimeCode = false,
  autoFocus = true,
  accessibilityLabel = "6-digit code",
  testID,
}: Props) {
  const colors = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const digits = digitsOf(value);
  const caret = Math.min(digits.length, LENGTH - 1);

  return (
    <Pressable onPress={() => inputRef.current?.focus()} className="relative">
      <View className="flex-row gap-2" pointerEvents="none">
        {Array.from({ length: LENGTH }, (_, index) => {
          const filled = Boolean(digits[index]);
          const current = editable && !invalid && index === caret && digits.length < LENGTH;
          return (
            <View
              key={index}
              className={
                invalid
                  ? "h-14 min-w-0 flex-1 items-center justify-center rounded-field border-2 border-error bg-surface"
                  : current
                    ? "h-14 min-w-0 flex-1 items-center justify-center rounded-field border-2 border-action-yellow bg-surface"
                    : filled
                      ? "h-14 min-w-0 flex-1 items-center justify-center rounded-field border border-outline bg-surface-high"
                      : editable
                        ? "h-14 min-w-0 flex-1 items-center justify-center rounded-field border border-outline bg-surface"
                        : "h-14 min-w-0 flex-1 items-center justify-center rounded-field border border-outline bg-surface-variant"
              }
            >
              <Text className="text-h2 text-text-primary">{digits[index] ?? ""}</Text>
            </View>
          );
        })}
      </View>

      <TextInput
        ref={inputRef}
        testID={testID}
        value={digits}
        onChangeText={(next) => onChange(digitsOf(next))}
        onSubmitEditing={() => {
          if (digits.length === LENGTH && editable) onSubmit?.();
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType={oneTimeCode ? "oneTimeCode" : "none"}
        autoComplete={oneTimeCode ? (process.env.EXPO_OS === "android" ? "sms-otp" : "one-time-code") : "off"}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        maxLength={LENGTH}
        caretHidden
        importantForAutofill={oneTimeCode ? "yes" : "no"}
        accessibilityLabel={accessibilityLabel}
        editable={editable}
        style={[styles.hiddenInput, { color: colors.textPrimary }]}
      />
    </Pressable>
  );
}

export function digitsOf(value: string): string {
  return value.replace(/\D/g, "").slice(0, LENGTH);
}

const styles = StyleSheet.create({
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.02,
    fontSize: 16,
  },
});
