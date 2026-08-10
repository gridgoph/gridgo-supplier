import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import { presentLifecycle, type CategoryDeclaration } from "@/lib/supplierServices";

type Props = {
  declaration: CategoryDeclaration;
  onPress: () => void;
};

/**
 * One catalogue category on the shop's services screen.
 *
 * The name leads and the audience line says who buys it, because that is what a
 * shop weighs when deciding whether the category is worth taking on. Underneath
 * sits the one fact that changes day to day: whether GRIDGO is sending this work
 * yet, and whose move it is if not.
 */
export function ServiceCategoryCard({ declaration, onPress }: Props) {
  const colors = useThemeColors();
  const { category, offered, lifecycle } = declaration;
  const status = offered && lifecycle ? presentLifecycle(lifecycle) : null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        status
          ? `${category.name}, ${status.label}`
          : `${category.name}, not offered`
      }
      className="gg-touch rounded-card border border-outline bg-surface p-4"
      style={({ pressed }) => (pressed ? { opacity: 0.75 } : undefined)}
    >
      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-h3 text-text-primary">{category.name}</Text>
          {category.bestFor ? (
            <Text className="text-caption text-text-muted" numberOfLines={2}>
              {category.bestFor}
            </Text>
          ) : null}
        </View>
        <View className="pt-1">
          <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
        </View>
      </View>

      <View className="mt-4 flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-caption text-text-muted" numberOfLines={1}>
          {category.covers.length} kinds of work
        </Text>
        {status ? (
          <StatusChip tone={status.tone} icon={status.icon} label={status.label} />
        ) : (
          <Text className="text-caption text-text-muted">Not offered</Text>
        )}
      </View>
    </Pressable>
  );
}
