import { Pressable, Text, View, type PressableProps } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

type Props = {
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
};

/**
 * "Continue with Facebook", built exactly like the Google button under it:
 * the charcoal-outlined secondary button with the provider's own mark. Only
 * the mark carries Facebook's blue; the yellow stays with Sign in.
 */
export function FacebookSignInButton({ onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Continue with Facebook"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
    >
      {({ pressed }) => (
        <>
          <View className="flex-row items-center justify-center gap-3">
            <FacebookMark />
            <Text className="text-button text-text-primary">Continue with Facebook</Text>
          </View>
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}

/** Meta's round "f": white letter on Facebook blue, in both themes. */
function FacebookMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
      <Circle cx={12} cy={12} r={11.5} fill="#FFFFFF" />
      <Path
        fill="#0866FF"
        d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"
      />
    </Svg>
  );
}
