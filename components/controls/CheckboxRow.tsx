import { Check } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** What ticking it says. Also the accessibility label. */
  label: string;
  /** A line under the label: what it means, or that it is optional. */
  hint?: ReactNode;
  disabled?: boolean;
};

/**
 * One square box and the sentence it agrees to.
 *
 * Starts however the caller says, and a caller with an agreement in it always
 * starts it unticked: a box GRIDGO ticked for someone records nothing they did.
 * The whole row is the target, 44pt high at least, and the box is ink — never
 * yellow — because it is a control, not the screen's action.
 */
export function CheckboxRow({ checked, onChange, label, hint, disabled = false }: Props) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={() => onChange(!checked)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={label}
      className={disabled ? "gg-touch gg-disabled flex-row items-start gap-3 py-2" : "gg-touch flex-row items-start gap-3 py-2"}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View
        className={
          checked
            ? "mt-0.5 h-6 w-6 items-center justify-center rounded-sm bg-accent"
            : "mt-0.5 h-6 w-6 items-center justify-center rounded-sm border-2 border-text-muted bg-surface"
        }
      >
        {checked ? <Check size={16} color={colors.accentOn} strokeWidth={3} aria-hidden /> : null}
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body-lg text-text-primary">{label}</Text>
        {typeof hint === "string" ? (
          <Text className="text-caption text-text-muted">{hint}</Text>
        ) : (
          hint ?? null
        )}
      </View>
    </Pressable>
  );
}
