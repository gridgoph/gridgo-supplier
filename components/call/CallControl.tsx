import type { LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Tone = "toggle" | "end" | "accept";

type Props = {
  icon: LucideIcon;
  /** Said under the button and to a screen reader: "Mute", "Speaker", "End call". */
  label: string;
  onPress: () => void;
  tone?: Tone;
  /** For a toggle: on draws charcoal, off draws a quiet panel. */
  on?: boolean;
  disabled?: boolean;
  testID?: string;
};

/**
 * A round call control with its word underneath. End and Decline are the
 * error red; Accept is the screen's one yellow; mute and speaker are charcoal
 * when on and a quiet panel when off, and say "on" in their state as well as
 * their colour.
 */
export function CallControl({ icon: Icon, label, onPress, tone = "toggle", on = false, disabled = false, testID }: Props) {
  const colors = useThemeColors();
  const big = tone !== "toggle";
  const size = big ? 72 : 60;
  const background =
    tone === "end" ? colors.error : tone === "accept" ? colors.actionYellow : on ? colors.accent : colors.surfaceVariant;
  const foreground =
    tone === "end" ? colors.errorOn : tone === "accept" ? colors.actionYellowOn : on ? colors.accentOn : colors.textPrimary;

  return (
    <View className="min-w-20 items-center gap-2">
      <Pressable
        onPress={onPress}
        disabled={disabled}
        testID={testID}
        accessibilityRole={tone === "toggle" ? "switch" : "button"}
        accessibilityLabel={label}
        accessibilityState={tone === "toggle" ? { checked: on, disabled } : { disabled }}
        className={tone === "toggle" && !on ? "items-center justify-center rounded-pill border border-outline" : "items-center justify-center rounded-pill"}
        style={({ pressed }) => ({
          width: size,
          height: size,
          backgroundColor: background,
          opacity: disabled ? 0.38 : pressed ? 0.8 : 1,
        })}
      >
        <Icon size={big ? 30 : 24} color={foreground} strokeWidth={2} aria-hidden />
      </Pressable>
      <Text className="text-caption text-center text-text-secondary">{label}</Text>
    </View>
  );
}
