import { useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
 * Six tear-off docket stubs for a job number — not six generic PIN boxes.
 *
 * The hidden field sits over the strip so the OS can autofill a one-time
 * code. One stub is current at a time; yellow is spent on the perforation,
 * the focused tear-off edge, and Verify.
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
  const focused = Math.min(digits.length, LENGTH - 1);

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
        <View
          className="flex-row overflow-hidden border border-outline bg-surface"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length: LENGTH }, (_, index) => (
            <View key={index} className="min-h-14 min-w-0 flex-1">
              <View
                className="flex-1 items-center justify-center"
                style={
                  index === focused
                    ? { borderBottomWidth: 2, borderBottomColor: colors.actionYellow }
                    : undefined
                }
              >
                <View
                  style={[
                    styles.stubTab,
                    {
                      backgroundColor:
                        index === focused ? colors.actionYellow : colors.outline,
                    },
                  ]}
                />
                <Text className="text-h2 text-text-primary">{digits[index] ?? ""}</Text>
              </View>
              {index < LENGTH - 1 ? (
                <View
                  pointerEvents="none"
                  style={[styles.perf, { borderColor: colors.actionYellow }]}
                >
                  <View
                    style={[styles.punch, { backgroundColor: colors.canvas, top: -5 }]}
                  />
                  <View
                    style={[
                      styles.punch,
                      { backgroundColor: colors.canvas, bottom: -5 },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>

        <TextInput
          ref={inputRef}
          value={digits}
          onChangeText={(next) => onChange(digitsOf(next))}
          onSubmitEditing={() => {
            if (digits.length === LENGTH && !busy) onVerify();
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={LENGTH}
          caretHidden
          importantForAutofill="yes"
          accessibilityLabel="6-digit job number"
          editable={!busy}
          style={styles.hiddenInput}
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
  stubTab: {
    position: "absolute",
    top: 0,
    width: 18,
    height: 5,
  },
  perf: {
    position: "absolute",
    top: 8,
    bottom: 8,
    right: 0,
    borderRightWidth: 1,
    borderStyle: "dashed",
  },
  punch: {
    position: "absolute",
    right: -5,
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  hiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: "transparent",
    fontSize: 16,
  },
});
