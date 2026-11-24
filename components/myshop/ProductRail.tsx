import { Plus } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { RenderGuard } from "@/components/RenderGuard";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";
import {
  boardContextFor,
  boardStanding,
  firstPhotoUrl,
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

/** How many of these clients can see right now. A product that cannot be judged is not counted. */
export function liveCount(listings: Listing[], services: ServiceLine[], shopApproved: boolean, readiness: Readiness | null): number {
  return listings.filter((listing) => {
    try {
      return (
        boardStanding(listing, boardContextFor(listing, services), shopApproved, listingReadinessFor(readiness, listing.id))
          .kind === "live"
      );
    } catch {
      return false;
    }
  }).length;
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
          : listings.map((listing) => (
              <RenderGuard key={listing.id} fallback={<UnavailableTile listing={listing} />}>
                <ProductTile listing={listing} services={services} readiness={readiness} shopApproved={shopApproved} />
              </RenderGuard>
            ))}
        <Pressable
          onPress={() => router.push("/shop/add" as Href)}
          accessibilityRole="button"
          accessibilityLabel="Add a product"
          style={({ pressed }) => [{ width: 112, minHeight: 176 }, pressed ? { opacity: 0.7 } : null]}
        >
          <View className="flex-1 items-center justify-center gap-2 rounded-card border border-dashed border-outline">
            <Plus size={24} color={colors.textPrimary} aria-hidden />
            <Text className="text-body font-medium text-text-primary">Add</Text>
          </View>
        </Pressable>
      </ScrollView>
    </View>
  );
}

type TileProps = {
  listing: Listing;
  services: ServiceLine[];
  readiness: Readiness | null;
  shopApproved: boolean;
};

/*
 * The tile's size is on a Pressable with no className, and its classes are on
 * the View inside. On a phone, NativeWind merges a Pressable's className and a
 * `style` function into `[classStyle, styleFn]`, and React Native only calls a
 * `style` that is itself a function, so the width in that function was
 * dropped: the tile had no width, its square photo grew to the picture's own
 * pixel size, and My shop closed the app (issue report 8DC78D1F).
 */
function ProductTile({ listing, services, readiness, shopApproved }: TileProps) {
  const standing = boardStanding(
    listing,
    boardContextFor(listing, services),
    shopApproved,
    listingReadinessFor(readiness, listing.id),
  );
  const first = listing.photos[0];
  const price = priceLine(listing);
  return (
    <Pressable
      onPress={() => router.push(`/product-actions?id=${encodeURIComponent(listing.id)}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${listing.name || "Untitled product"}. ${standing.label}. Show, hide, edit or remove.`}
      style={({ pressed }) => [{ width: TILE_WIDTH }, pressed ? { opacity: 0.7 } : null]}
      testID={`product-tile-${listing.id}`}
    >
      <View className="rounded-card border border-outline bg-surface">
        <SamplePhoto
          fileId={first?.fileId}
          url={firstPhotoUrl(listing)}
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
            {price}
          </Text>
          <View className="mt-1 flex-row">
            <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} wrap />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

/**
 * A product this rail could not draw, said plainly. It still opens the
 * product's actions, so the shop can fix or remove it from here.
 */
function UnavailableTile({ listing }: { listing: Listing }) {
  return (
    <Pressable
      onPress={() => router.push(`/product-actions?id=${encodeURIComponent(listing.id)}` as Href)}
      accessibilityRole="button"
      accessibilityLabel={`${listing.name || "Untitled product"}. Can't show this here. Open it to check it.`}
      style={({ pressed }) => [{ width: TILE_WIDTH, minHeight: 176 }, pressed ? { opacity: 0.7 } : null]}
      testID={`product-tile-${listing.id}-unavailable`}
    >
      <View className="flex-1 justify-end gap-1 rounded-card border border-outline bg-surface p-3">
        <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
          {listing.name || "Untitled product"}
        </Text>
        <View className="flex-row">
          <StatusChip tone="warning" icon="triangle-alert" label="Can't show this here" wrap />
        </View>
      </View>
    </Pressable>
  );
}
