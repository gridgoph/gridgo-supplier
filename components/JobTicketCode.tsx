import { useRef } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useThemeColors } from "@/hooks/useTheme";

const LENGTH = 6;

type Props = {
  /** What this code is for — signup, sign-in, or recovery. */
  title?: string;
  email: string;
  value: string;
  onChange: (value: string) => void;
  onVerify: () => void;
  onResend: () => void;
  verifyLabel?: string;
  resendLabel?: string;
  busy?: boolean;
  error?: string | null;
};

/**
 * Six digit boxes over one native OTP field.
 *
 * The boxes are the product surface. The hidden field sits on top so iOS and
 * Android can autofill a one-time code — a second visible field would steal it.
 * Yellow is spent on the current box and Verify, nothing else.
 */
export function JobTicketCode({
  title = "Check your email",
  email,
  value,
  onChange,
  onVerify,
  onResend,
  verifyLabel = "Verify email",
  resendLabel = "Send another code",
  busy = false,
  error = null,
}: Props) {
  const colors = useThemeColors();
  const inputRef = useRef<TextInput>(null);
  const digits = digitsOf(value);
  const caret = Math.min(digits.length, LENGTH - 1);

  return (
    <View className="gap-6">
      {title ? (
        <View className="gap-1">
          <Text className="text-h1 text-text-primary">{title}</Text>
          <Text className="text-body-lg text-text-secondary">
            We sent a 6-digit job number to {email}
          </Text>
        </View>
      ) : (
        <Text className="text-body-lg text-text-secondary">
          We sent a 6-digit job number to {email}
        </Text>
      )}

      <Pressable onPress={() => inputRef.current?.focus()} className="relative">
        <View className="flex-row gap-2" pointerEvents="none">
          {Array.from({ length: LENGTH }, (_, index) => {
            const filled = Boolean(digits[index]);
            const current = !busy && index === caret && digits.length < LENGTH;
            return (
              <View
                key={index}
                className={
                  current
                    ? "h-14 min-w-0 flex-1 items-center justify-center rounded-field border-2 border-action-yellow bg-surface"
                    : filled
                      ? "h-14 min-w-0 flex-1 items-center justify-center rounded-field border border-outline bg-surface-high"
                      : "h-14 min-w-0 flex-1 items-center justify-center rounded-field border border-outline bg-surface"
                }
              >
                <Text className="text-h2 text-text-primary">{digits[index] ?? ""}</Text>
              </View>
            );
          })}
        </View>

        <TextInput
          ref={inputRef}
          value={digits}
          onChangeText={(next) => onChange(digitsOf(next))}
          onSubmitEditing={() => {
            if (digits.length === LENGTH && !busy) onVerify();
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          textContentType="oneTimeCode"
          autoComplete={process.env.EXPO_OS === "android" ? "sms-otp" : "one-time-code"}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          maxLength={LENGTH}
          caretHidden
          importantForAutofill="yes"
          accessibilityLabel="6-digit job number"
          editable={!busy}
          style={[
            styles.hiddenInput,
            { color: colors.textPrimary },
          ]}
        />
      </Pressable>

      {error ? <ErrorNotice message={error} /> : null}

      <View className="gap-3">
        <PrimaryButton
          label={busy ? "Checking…" : verifyLabel}
          disabled={busy || digits.length < LENGTH}
          onPress={onVerify}
        />
        <Pressable
          onPress={onResend}
          disabled={busy}
          accessibilityRole="button"
          accessibilityState={{ disabled: Boolean(busy) }}
          accessibilityLabel={resendLabel}
          className="gg-touch items-center justify-center"
          style={({ pressed }) => (pressed || busy ? { opacity: 0.7 } : undefined)}
        >
          <Text className="text-button text-text-secondary">{resendLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, "").slice(0, LENGTH);
}

const styles = StyleSheet.create({
  hiddenInput: {
    ...StyleSheet.absoluteFill,
    opacity: 0.02,
    fontSize: 16,
  },
});
