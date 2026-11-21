import { Pressable, Text, View, type PressableProps } from "react-native";

type Props = {
  /** A clear verb. "Approve & Continue", not "Submit". */
  label: string;
  onPress?: PressableProps["onPress"];
  disabled?: boolean;
  /**
   * A second, smaller line under the verb — the same action in the shop's own
   * language on the big counter buttons ("Dawata", "Andam na"). It makes the
   * button taller, so it is for the one action a card exists to take.
   */
  hint?: string;
  testID?: string;
};

/**
 * The one primary action on a screen or bounded panel.
 *
 * Yellow is a finite attention budget. If a screen already has a
 * PrimaryButton, every other action on it is a SecondaryButton.
 */
export function PrimaryButton({ label, onPress, disabled, hint, testID }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      testID={testID}
      className={[
        "gg-btn-primary",
        hint ? "h-auto min-h-14 flex-col gap-0 py-2" : "",
        disabled ? "gg-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {({ pressed }) => (
        <>
          <Text className={hint ? "text-body-lg font-bold text-action-yellow-on" : "text-button text-action-yellow-on"}>
            {label}
          </Text>
          {hint ? <Text className="text-caption text-action-yellow-on">{hint}</Text> : null}
          {/* 8% pressed overlay, per the interaction spec. */}
          {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
        </>
      )}
    </Pressable>
  );
}
