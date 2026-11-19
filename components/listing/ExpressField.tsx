import { Zap } from "lucide-react-native";
import { Text, View } from "react-native";

import { SwitchRow } from "@/components/controls/SwitchRow";
import { useThemeColors } from "@/hooks/useTheme";
import { EXPRESS_SWITCH_HINT, EXPRESS_SWITCH_LABEL } from "@/lib/express";

type Props = {
  /** What the listing holds on GRIDGO now. */
  on: boolean;
  /** The value on its way, or null. */
  pending: boolean | null;
  disabled: boolean;
  /** A refusal in plain words; the switch is back where GRIDGO has it. */
  error: string | null;
  onChange: (next: boolean) => void;
};

/**
 * The shop's Express opt-in on a per-page Document printing listing.
 *
 * It saves the moment it is flipped and never opens review, so it sits in a
 * card of its own rather than among the fields the Save button holds.
 */
export function ExpressField({ on, pending, disabled, error, onChange }: Props) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-2" testID="express-field">
      <View className="flex-row items-center gap-2">
        <Zap size={18} color={colors.info} strokeWidth={2} />
        <View className="min-w-0 flex-1">
          <SwitchRow
            value={pending ?? on}
            onChange={onChange}
            label={EXPRESS_SWITCH_LABEL}
            hint={EXPRESS_SWITCH_HINT}
            disabled={disabled || pending != null}
          />
        </View>
      </View>
      {pending != null ? (
        <Text className="text-caption text-text-muted" accessibilityLiveRegion="polite">
          Saving…
        </Text>
      ) : null}
      {error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
