import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";

import { DigitBoxes, digitsOf } from "@/components/DigitBoxes";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";

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
  const digits = digitsOf(value);

  return (
    <View className="gap-6">
      {title ? (
        <View className="gap-1">
          <Text className="text-h1 text-text-primary">{title}</Text>
          <Text className="text-body-lg text-text-secondary">
            We sent a 6-digit code to {email}
          </Text>
        </View>
      ) : (
        <Text className="text-body-lg text-text-secondary">
          We sent a 6-digit code to {email}
        </Text>
      )}

      <DigitBoxes value={value} onChange={onChange} onSubmit={onVerify} editable={!busy} oneTimeCode />

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
