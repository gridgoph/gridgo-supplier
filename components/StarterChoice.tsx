import { Circle, CircleDot } from "lucide-react-native";
import { Image, Pressable, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { starterImage } from "@/constants/images";
import type { ListingStarter } from "@/lib/listings";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  starters: readonly ListingStarter[];
  value: string;
  blankValue: string;
  onChange: (value: string) => void;
};

/**
 * Where a listing starts: GRIDGO's own sample, or a blank plate.
 *
 * The crop-mark tile is the same mark the board uses, so the example reads as
 * a print sample rather than a product card. Creating from this starter copies
 * the photo onto the listing as its first sample.
 */
export function StarterChoice({ starters, value, blankValue, onChange }: Props) {
  const colors = useThemeColors();

  return (
    <View
      className="gap-2"
      accessibilityRole="radiogroup"
      accessibilityLabel="Where to start this listing from"
    >
      {starters.map((starter) => {
        const selected = value === starter.id;
        const sample = starterImage(starter.id);
        return (
          <Pressable
            key={starter.id}
            onPress={() => onChange(starter.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={`GRIDGO starter, ${starter.name}`}
            className={
              selected
                ? "gg-touch flex-row items-center gap-3 rounded-field border border-accent bg-surface px-3 py-3"
                : "gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
            }
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <View className="w-20 shrink-0">
              <CropMarkFrame gutter="tight">
                <View className="aspect-square w-full">
                  {sample ? (
                    <Image
                      source={sample}
                      accessibilityLabel={`Example of a ${starter.name} sample`}
                      resizeMode="cover"
                      style={{ width: "100%", height: "100%" }}
                    />
                  ) : (
                    <View className="flex-1 items-center justify-center p-2">
                      <Text className="text-center text-caption text-text-muted">Example</Text>
                    </View>
                  )}
                </View>
              </CropMarkFrame>
            </View>
            <View className="min-w-0 flex-1">
              <Text className="text-overline text-text-muted">GRIDGO starter</Text>
              <Text
                className={
                  selected
                    ? "mt-0.5 text-body font-medium text-text-primary"
                    : "mt-0.5 text-body text-text-secondary"
                }
              >
                {starter.name}
              </Text>
              <Text className="mt-0.5 text-caption text-text-muted">
                {starterDetail(starter)}
              </Text>
            </View>
            {selected ? (
              <CircleDot size={20} color={colors.accent} strokeWidth={2} />
            ) : (
              <Circle size={20} color={colors.textMuted} strokeWidth={2} />
            )}
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => onChange(blankValue)}
        accessibilityRole="radio"
        accessibilityState={{ checked: value === blankValue }}
        accessibilityLabel="Start blank"
        className={
          value === blankValue
            ? "gg-touch flex-row items-start gap-3 rounded-field border border-accent bg-surface px-3 py-3"
            : "gg-touch flex-row items-start gap-3 rounded-field border border-outline bg-surface px-3 py-3"
        }
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        {value === blankValue ? (
          <CircleDot size={20} color={colors.accent} strokeWidth={2} />
        ) : (
          <Circle size={20} color={colors.textMuted} strokeWidth={2} />
        )}
        <View className="min-w-0 flex-1">
          <Text
            className={
              value === blankValue
                ? "text-body font-medium text-text-primary"
                : "text-body text-text-secondary"
            }
          >
            Start blank
          </Text>
          <Text className="mt-0.5 text-caption text-text-muted">
            You add your own steps, add-ons and prices.
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

/** What a starter brings, so it can be chosen without opening it. */
export function starterDetail(starter: ListingStarter): string {
  const parts: string[] = [];
  if (starter.specCount) {
    parts.push(starter.specCount === 1 ? "1 step" : `${starter.specCount} steps`);
  }
  if (starter.addOnCount) {
    parts.push(starter.addOnCount === 1 ? "1 add-on" : `${starter.addOnCount} add-ons`);
  }
  if (starter.turnaroundHours) parts.push(`ready in ${starter.turnaroundHours} hours`);
  return parts.length
    ? `Comes with ${parts.join(", ")}. All of it yours to change.`
    : "GRIDGO's own starting point for this work.";
}
