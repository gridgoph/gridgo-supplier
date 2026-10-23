import { Pressable, Text, View, type PressableProps } from "react-native";

type Props = {
  label: string;
  /** Spoken name when the visible label is shared by more than one row. */
  accessibilityLabel?: string;
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
};

/**
 * Every action that is not the screen's primary one.
 *
 * Stays monochrome so the single yellow CTA keeps its meaning.
 */
export function SecondaryButton({ label, accessibilityLabel, onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: Boolean(disabled) }}
      className={disabled ? "gg-btn-secondary gg-disabled" : "gg-btn-secondary"}
    >
      {({ pressed }) => (
        <>
          <Text className="text-button text-text-primary">{label}</Text>
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}
