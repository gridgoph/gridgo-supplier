import { ChevronRight } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { router } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { SamplePhoto } from "@/components/SamplePhoto";
import { StatusChip } from "@/components/StatusChip";
import { useCheckProducts } from "@/hooks/useCheckProducts";
import { useThemeColors } from "@/hooks/useTheme";
import { firstPhotoUrl } from "@/lib/listings";
import { templateProductHref, templateStanding } from "@/lib/productTemplates";

/**
 * Check your products (gridgo-supplier#268): every product waiting on the shop,
 * each one tap from its price table. Products that need a price come first —
 * they are the ones clients cannot see at all.
 */
export default function CheckProductsScreen() {
  const { check, reload } = useCheckProducts();
  const colors = useThemeColors();
  const items = [...(check?.items ?? [])].sort(
    (a, b) => Number(Boolean(b.template?.needsPrice)) - Number(Boolean(a.template?.needsPrice)),
  );

  return (
    <View className="gg-screen">
      <ScrollView contentContainerClassName="gg-page gap-3 pb-10 pt-4">
        <Text className="text-body text-text-secondary">
          These are hidden from clients until you add or confirm their prices. A new price is for new orders only.
        </Text>
        {check && !items.length ? (
          <EmptyState
            title="Nothing to check"
            body="Every product has its prices. Add another from Products whenever you like."
            actionLabel="Check again"
            onAction={() => void reload()}
          />
        ) : null}
        {items.map((listing) => {
          const standing = templateStanding(listing);
          return (
            <Pressable
              key={listing.id}
              onPress={() => router.push(templateProductHref(listing.id))}
              accessibilityRole="button"
              accessibilityLabel={`${listing.name}. ${standing.label}`}
              className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface p-3"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            >
              <View className="w-14 shrink-0">
                <SamplePhoto fileId={listing.photos[0]?.fileId} url={firstPhotoUrl(listing)} altText={listing.name} gutter="tight" enlarge={false} emptyLabel="Photo" />
              </View>
              <View className="min-w-0 flex-1 gap-1">
                <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
                  {listing.name}
                </Text>
                <View className="flex-row">
                  <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} />
                </View>
              </View>
              <ChevronRight size={20} color={colors.textMuted} aria-hidden />
            </Pressable>
          );
        })}
        {check && check.suggested > 0 ? (
          <Text className="text-caption text-text-muted">
            The GRIDGO team may also move your older products onto GRIDGO&apos;s price tables and join duplicates.
            They tell you first, and nothing with an open order is touched.
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}
