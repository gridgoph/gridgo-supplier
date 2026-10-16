import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

type Props = {
  value: boolean;
  onChange: (value: boolean) => void;
  /** What switching it on means. Also the accessibility label. */
  label: string;
  hint?: ReactNode;
  disabled?: boolean;
};

/**
 * An on/off setting and the sentence it sets.
 *
 * Drawn from tokens for the same reason as the segmented control: the
 * platform switch paints its own geometry and colour from the OS. Ink when on,
 * outline when off, with the knob's side and the "On"/"Off" word saying it
 * again, so it reads in greyscale. Never yellow — it is a control, not the
 * screen's action. The whole row is the target.
 */
export function SwitchRow({ value, onChange, label, hint, disabled = false }: Props) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      className={disabled ? "gg-touch gg-disabled flex-row items-center gap-3 py-2" : "gg-touch flex-row items-center gap-3 py-2"}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body-lg text-text-primary">{label}</Text>
        {typeof hint === "string" ? <Text className="text-caption text-text-muted">{hint}</Text> : (hint ?? null)}
      </View>
      <View className="items-center gap-1">
        <View
          className={
            value
              ? "h-7 w-12 flex-row items-center justify-end rounded-pill bg-accent px-1"
              : "h-7 w-12 flex-row items-center justify-start rounded-pill border-2 border-text-muted bg-surface px-0.5"
          }
        >
          <View className={value ? "h-5 w-5 rounded-pill bg-accent-on" : "h-5 w-5 rounded-pill bg-text-muted"} />
        </View>
        <Text className="text-caption text-text-muted" aria-hidden>
          {value ? "On" : "Off"}
        </Text>
      </View>
    </Pressable>
  );
}
