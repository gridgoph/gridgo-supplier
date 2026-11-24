import { ChevronRight } from "lucide-react-native";
import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { router, type Href } from "expo-router";

import { useThemeColors } from "@/hooks/useTheme";
import { checkProductsLine } from "@/lib/productTemplates";
import type { CheckProducts } from "@/hooks/useCheckProducts";

/**
 * "Check your products" on My shop (gridgo-supplier#268).
 *
 * Drawn only when a product is waiting on the shop — a price to add before it
 * can be shown, or prices the GRIDGO team filled in that need the shop's OK.
 * A warning-coloured edge and an icon-free count keep it calm: nothing is
 * broken, something is waiting for a minute of the shop's time.
 */
export function CheckProductsCard({ check }: { check: CheckProducts | null }) {
  const colors = useThemeColors();
  if (!check || !check.items.length) return null;
  const line = checkProductsLine(check.items);
  return (
    <Pressable
      onPress={() => router.push("/shop/check-products" as Href)}
      accessibilityRole="button"
      accessibilityLabel={`Check your products. ${line}`}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-warning bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      testID="check-products-card"
    >
      <View className="h-9 min-w-9 items-center justify-center rounded-pill border border-warning px-2">
        <Text className="text-body font-bold text-warning">{check.items.length}</Text>
      </View>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">Check your products</Text>
        <Text className="text-caption text-text-secondary" numberOfLines={2}>
          {line}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}
