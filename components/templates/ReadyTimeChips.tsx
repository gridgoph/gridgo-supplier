import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import type { ReadyTimeChip } from "@/lib/productTemplates";

/**
 * When it is ready: four chips from GRIDGO and one dated example under them.
 *
 * The chips are GRIDGO's (`readyTimes`), so a change of wording or a fifth
 * choice needs no release. The selected chip is ink, not yellow — it is a
 * choice, and the yellow is the step's action. The example is GRIDGO's own
 * date on the shop's hours, so it is honest on a Saturday too.
 */
export function ReadyTimeChips({
  chips,
  value,
  onChange,
  example,
  loadingExample,
  exampleNote,
}: {
  chips: ReadyTimeChip[];
  value: string | null;
  onChange: (code: string) => void;
  example: string | null;
  loadingExample: boolean;
  /** Said in place of the example when GRIDGO could not give one. */
  exampleNote?: string | null;
}) {
  const colors = useThemeColors();
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
        {chips.map((chip) => {
          const on = chip.code === value;
          return (
            <Pressable
              key={chip.code}
              onPress={() => onChange(chip.code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={chip.label}
              testID={`ready-chip-${chip.code}`}
              className={[
                "gg-touch justify-center rounded-pill border px-4",
                on ? "border-accent bg-accent" : "border-outline bg-surface",
              ].join(" ")}
            >
              <Text className={on ? "text-button text-accent-on" : "text-button text-text-primary"}>{chip.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {value ? (
        <View className="gg-panel flex-row items-center gap-3" accessibilityLiveRegion="polite">
          {loadingExample ? <ActivityIndicator size="small" color={colors.textMuted} /> : null}
          <Text className="min-w-0 flex-1 text-body text-text-primary" testID="ready-by-example">
            {loadingExample ? "Working out the date…" : example ?? exampleNote ?? "GRIDGO shows clients the date on your hours."}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
