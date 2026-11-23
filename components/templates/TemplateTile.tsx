import { Check } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import { useThemeColors } from "@/hooks/useTheme";
import { machinesLine, type ProductTemplate } from "@/lib/productTemplates";

export type TileState = "open" | "ticked" | "added" | "no_service";

/**
 * One GRIDGO product on the "What do you make?" grid.
 *
 * The photo is the tile, as on the shop's own board — a print shop picks by
 * looking. Ticked is an ink check in the corner and an ink border, never
 * yellow: ticking is a choice, the yellow is the step's one action. "Added"
 * opens the product the shop already has instead of ticking it twice, and a
 * product outside the shop's services says what to do about it rather than
 * hiding — the shop should know it exists.
 */
export function TemplateTile({
  template,
  state,
  onPress,
}: {
  template: ProductTemplate;
  state: TileState;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const ticked = state === "ticked";
  const caption =
    state === "added"
      ? "Added — tap to open"
      : state === "no_service"
        ? "Add this service first"
        : machinesLine(template);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked, disabled: state === "no_service" }}
      accessibilityLabel={`${template.name}. ${caption ?? ""}`}
      testID={`template-tile-${template.id}`}
      className={[
        "rounded-card border bg-surface",
        ticked ? "border-2 border-accent" : "border-outline",
      ].join(" ")}
      style={({ pressed }) => (pressed ? { opacity: 0.8 } : undefined)}
    >
      <View className={state === "no_service" ? "opacity-60" : undefined}>
        <SamplePhoto url={template.photoUrl} altText={template.photoAlt} gutter="tight" emptyLabel="Photo" enlarge={false} />
      </View>
      <View className="gap-0.5 p-2.5">
        <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
          {template.name}
        </Text>
        {caption ? (
          <Text
            className={state === "added" ? "text-caption text-success" : "text-caption text-text-muted"}
            numberOfLines={2}
          >
            {caption}
          </Text>
        ) : null}
      </View>
      {ticked || state === "added" ? (
        <View
          className={[
            "absolute right-2 top-2 h-7 w-7 items-center justify-center rounded-pill",
            ticked ? "bg-accent" : "border border-success bg-surface",
          ].join(" ")}
          aria-hidden
        >
          <Check size={16} strokeWidth={3} color={ticked ? colors.accentOn : colors.success} />
        </View>
      ) : null}
    </Pressable>
  );
}
