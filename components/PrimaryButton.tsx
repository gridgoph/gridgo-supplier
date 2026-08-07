import { Pressable, Text, View, type PressableProps } from "react-native";

type Props = {
  /** A clear verb. "Approve & Continue", not "Submit". */
  label: string;
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
};

/**
 * The one primary action on a screen or bounded panel.
 *
 * Yellow is a finite attention budget. If a screen already has a
 * PrimaryButton, every other action on it is a SecondaryButton.
 */
export function PrimaryButton({ label, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-primary gg-disabled" : "gg-btn-primary"}
    >
      {({ pressed }) => (
        <>
          <Text className="text-button text-action-yellow-on">{label}</Text>
          {/* 8% pressed overlay, per the interaction spec. */}
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}
