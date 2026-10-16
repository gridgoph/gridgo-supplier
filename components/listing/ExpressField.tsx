import { Zap } from "lucide-react-native";
import { Text, View } from "react-native";

import { SwitchRow } from "@/components/controls/SwitchRow";
import { useThemeColors } from "@/hooks/useTheme";
import {
  EXPRESS_LABEL,
  EXPRESS_SWITCH_CAUTION,
  EXPRESS_SWITCH_HELP,
  expressStateLine,
} from "@/lib/express";

type Props = {
  /** What the listing holds on GRIDGO now. */
  on: boolean;
  /** The value being sent, while it is on its way; null otherwise. */
  pending: boolean | null;
  disabled: boolean;
  /** A refusal, in plain words. The switch is back where GRIDGO has it. */
  error: string | null;
  onChange: (next: boolean) => void;
};

/**
 * The shop's Express switch.
 *
 * It saves on its own the moment it is flipped and never opens a review, so it
 * sits in a panel of its own under the production time rather than among the
 * held fields, and says so. The state line under it is GRIDGO's, not the
 * phone's: while the change is on its way it reads "Saving…", and a refusal
 * leaves the switch where GRIDGO still has it, with the reason beneath.
 */
export function ExpressField({ on, pending, disabled, error, onChange }: Props) {
  const colors = useThemeColors();
  const shown = pending ?? on;

  return (
    <View className="gg-card gap-2">
      <View className="flex-row items-center gap-2">
        <Zap size={18} color={colors.info} strokeWidth={2} />
        <View className="min-w-0 flex-1">
          <SwitchRow
            value={shown}
            onChange={onChange}
            label={EXPRESS_LABEL}
            disabled={disabled || pending != null}
          />
        </View>
      </View>
      <Text className="text-caption text-text-secondary">
        {EXPRESS_SWITCH_HELP} {EXPRESS_SWITCH_CAUTION}
      </Text>
      <Text className="text-body font-medium text-text-primary" accessibilityLiveRegion="polite">
        {pending != null ? "Saving…" : expressStateLine(on)}
      </Text>
      {error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
