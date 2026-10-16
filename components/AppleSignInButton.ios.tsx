import { useSignInWithApple } from "@clerk/expo/apple";
import {
  AppleAuthenticationButton,
  AppleAuthenticationButtonStyle,
  AppleAuthenticationButtonType,
} from "expo-apple-authentication";
import { View } from "react-native";

import type { AppleSignInButtonProps } from "./AppleSignInButton";
import { useThemeName } from "@/hooks/useTheme";

/**
 * Apple's own system button, as its Human Interface Guidelines ask: black on
 * Light, white on Dark, "Continue with Apple", the same 44pt height and 12pt
 * corners as the Google button under it. It sits above Google, never lower.
 *
 * Apple's button has no disabled state, so a tap already in flight dims it
 * and stops touches the way `gg-disabled` does for every other control.
 */
export function AppleSignInButton({ onPress, disabled }: AppleSignInButtonProps) {
  const { startAppleAuthenticationFlow } = useSignInWithApple();
  const dark = useThemeName() === "dark";
  return (
    <View
      pointerEvents={disabled ? "none" : "auto"}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-disabled" : undefined}
    >
      <AppleAuthenticationButton
        buttonType={AppleAuthenticationButtonType.CONTINUE}
        buttonStyle={
          dark ? AppleAuthenticationButtonStyle.WHITE : AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={12}
        style={{ width: "100%", height: 44 }}
        onPress={() => onPress(() => startAppleAuthenticationFlow())}
      />
    </View>
  );
}
