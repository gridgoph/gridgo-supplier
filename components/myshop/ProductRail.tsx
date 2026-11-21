import { Plus } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { SamplePhoto } from "@/components/SamplePhoto";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  boardContextFor,
  boardStanding,
  photoViewUrl,
  priceLine,
  type Listing,
  type ServiceLine,
} from "@/lib/listings";
import { listingReadinessFor, type Readiness } from "@/lib/readiness";

type Props = {
  listings: Listing[];
  /** Every listing on the shop, not just this page. */
  total: number;
  services: ServiceLine[];
  readiness: Readiness | null;
  shopApproved: boolean;
  loading: boolean;
  error: string | null;
};

const TILE_WIDTH = 144;

/** How many of these clients can see right now. */
export function liveCount(listings: Listing[], services: ServiceLine[], shopApproved: boolean, readiness: Readiness | null): number {
  return listings.filter(
    (listing) =>
      boardStanding(listing, boardContextFor(listing, services), shopApproved, listingReadinessFor(readiness, listing.id))
        .kind === "live",
  ).length;
}

/**
 * The shop's products on My shop: a row of tiles with their standing, an Add
 * tile at the end and the way to the whole board (gridgo-supplier#267).
 *
 * A tile opens the product's quick actions (show or hide, edit, remove) rather
 * than the full editor, because what a shop wants from here is usually one of
 * those three, and the editor is one more tap inside the sheet.
 */
export function ProductRail({ listings, total, services, readiness, shopApproved, loading, error }: Props) {
  const colors = useThemeColors();
  const live = liveCount(listings, services, shopApproved, readiness);

  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          {listings.length ? `Products, ${live} live` : "Products"}
        </Text>
        <Pressable
          onPress={() => router.push("/(tabs)/catalogues")}
          accessibilityRole="button"
          accessibilityLabel={`See all ${total} products`}
          className="gg-touch justify-center"
        >
          <Text className="text-body font-medium text-brand">See all</Text>
        </Pressable>
      </View>

      {error && !listings.length ? <Text className="text-caption text-error">{error}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
        {loading && !listings.length
          ? [0, 1].map((key) => (
              <View key={key} style={{ width: TILE_WIDTH }}>
                <SkeletonBlock className="h-52 w-full rounded-card" />
              </View>
            ))
          : listings.map((listing) => {
              const standing = boardStanding(
                listing,
                boardContextFor(listing, services),
                shopApproved,
                listingReadinessFor(readiness, listing.id),
              );
              const first = listing.photos[0];
              return (
                <Pressable
                  key={listing.id}
                  onPress={() => router.push(`/product-actions?id=${encodeURIComponent(listing.id)}` as Href)}
                  accessibilityRole="button"
                  accessibilityLabel={`${listing.name || "Untitled product"}. ${standing.label}. Show, hide, edit or remove.`}
                  className="rounded-card border border-outline bg-surface"
                  style={({ pressed }) => [{ width: TILE_WIDTH }, pressed ? { opacity: 0.7 } : null]}
                  testID={`product-tile-${listing.id}`}
                >
                  <SamplePhoto
                    fileId={first?.fileId}
                    url={photoViewUrl(first)}
                    altText={first?.altText ?? listing.name}
                    gutter="tight"
                    emptyLabel="No photo yet"
                    enlarge={false}
                  />
                  <View className="gap-1 px-3 pb-3">
                    <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
                      {listing.name || "Untitled product"}
                    </Text>
                    <Text className="text-caption text-text-muted" numberOfLines={1}>
                      {priceLine(listing)}
                    </Text>
                    <View className="mt-1 flex-row">
                      <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} wrap />
                    </View>
                  </View>
                </Pressable>
              );
            })}
        <Pressable
          onPress={() => router.push("/shop/new")}
          accessibilityRole="button"
          accessibilityLabel="Add a product"
          className="items-center justify-center gap-2 rounded-card border border-dashed border-outline"
          style={({ pressed }) => [{ width: 112, minHeight: 176 }, pressed ? { opacity: 0.7 } : null]}
        >
          <Plus size={24} color={colors.textPrimary} aria-hidden />
          <Text className="text-body font-medium text-text-primary">Add</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
