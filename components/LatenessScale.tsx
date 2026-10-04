import { Clock, TriangleAlert } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { LATENESS_TIERS, tierDefinition, type LapseTier } from "@/lib/productionLapse";

type Props = {
  /** The tier this job reached. Absent: the scale explains every tier equally. */
  current?: LapseTier | null;
};

const SHORT_RANGE: Record<LapseTier, string> = {
  minor: "Up to 6 h",
  moderate: "6 to 24 h",
  severe: "Over 24 h",
};

const TONE_CLASS = {
  warning: { bar: "bg-warning", text: "text-warning", token: "warning" },
  error: { bar: "bg-error", text: "text-error", token: "error" },
} as const;

/**
 * The three lateness tiers as one measured strip, with the job's own tier lit.
 *
 * The bar fills from the left up to the tier reached, so a shop reads how far
 * past the line it went before reading any words — and the tiers it did not
 * reach stay visible, which is what makes "moderate" mean something. The lit
 * tier carries an icon and its label in the tier's colour, so it still reads
 * in grayscale. Never yellow: nothing here is pressed.
 */
export function LatenessScale({ current = null }: Props) {
  const colors = useThemeColors();
  const reached = current ? LATENESS_TIERS.findIndex((t) => t.tier === current) : -1;
  const tone = current ? TONE_CLASS[tierDefinition(current).tone === "error" ? "error" : "warning"] : null;
  const summary = LATENESS_TIERS.map((t) => `${t.label}, ${t.range.toLowerCase()}`).join(". ");

  return (
    <View
      className="flex-row gap-1.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${current ? `This job: ${tierDefinition(current).label} lateness. ` : ""}Tiers: ${summary}.`}
      testID="lateness-scale"
    >
      {LATENESS_TIERS.map((definition, index) => {
        const isCurrent = index === reached;
        const filled = tone !== null && index <= reached;
        const Icon = definition.icon === "clock" ? Clock : TriangleAlert;
        return (
          <View key={definition.tier} className="min-w-0 flex-1 gap-2" testID={`lateness-tier-${definition.tier}`}>
            <View className={`h-1.5 rounded-pill ${filled && tone ? tone.bar : "bg-outline"}`} />
            <View className="gap-0.5">
              <View className="flex-row items-center gap-1">
                {isCurrent && tone ? (
                  <Icon size={13} color={colors[tone.token]} strokeWidth={2} aria-hidden />
                ) : null}
                <Text
                  className={
                    isCurrent && tone
                      ? `shrink text-caption font-medium ${tone.text}`
                      : current
                        ? "shrink text-caption text-text-muted"
                        : "shrink text-caption font-medium text-text-primary"
                  }
                  numberOfLines={1}
                >
                  {definition.label}
                </Text>
              </View>
              <Text className="text-caption text-text-muted">{SHORT_RANGE[definition.tier]}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
