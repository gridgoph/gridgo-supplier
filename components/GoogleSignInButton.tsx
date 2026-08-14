import { Pressable, Text, View, type PressableProps } from "react-native";
import Svg, { Path } from "react-native-svg";

type Props = {
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
};

export function GoogleSignInButton({ onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
    >
      {({ pressed }) => (
        <>
          <View className="flex-row items-center justify-center gap-3">
            <GoogleMark />
            <Text className="text-button text-text-primary">Continue with Google</Text>
          </View>
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}

function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" accessibilityElementsHidden>
      <Path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.797 2.715v2.259h2.909c1.702-1.567 2.684-3.877 2.684-6.614Z"
      />
      <Path
        fill="#34A853"
        d="M9 18c2.43 0 4.468-.806 5.956-2.181l-2.909-2.259c-.806.54-1.836.86-3.047.86-2.344 0-4.328-1.585-5.037-3.715H.956v2.332A9 9 0 0 0 9 18Z"
      />
      <Path
        fill="#FBBC05"
        d="M3.963 10.705A5.42 5.42 0 0 1 3.681 9c0-.592.102-1.168.282-1.705V4.963H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.037l3.007-2.332Z"
      />
      <Path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.507.454 3.441 1.346l2.581-2.581C13.464.893 11.426 0 9 0A9 9 0 0 0 .956 4.963l3.007 2.332C4.672 5.165 6.656 3.58 9 3.58Z"
      />
    </Svg>
  );
}
