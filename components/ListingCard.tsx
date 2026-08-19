import { Pressable, Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import { StatusChip } from "@/components/StatusChip";
import type { SupplierService } from "@/lib/api";
import {
  boardContextFor,
  boardStanding,
  effectiveTurnaroundHours,
  priceLine,
  readyInLine,
  subcategoryName,
  type Listing,
} from "@/lib/listings";
import type { ServiceCatalog } from "@/lib/taxonomy";

type Props = {
  listing: Listing;
  catalog: ServiceCatalog | null;
  services: SupplierService[];
  shopApproved: boolean;
  onPress: () => void;
};

/**
 * One sample on the wall.
 *
 * The photo leads because that is what a client picks with, and it sits in its
 * crop-mark frame so the wall reads as print samples rather than a shelf of
 * products. Under it, the three facts a shop checks when it glances at its own
 * board: what it is called, what it costs, and how fast it goes out.
 *
 * The chip is only drawn when something is wrong or hidden. A tile that is up
 * and finished says so by being plain — a wall of green ticks is a wall nobody
 * reads.
 */
export function ListingCard({ listing, catalog, services, shopApproved, onPress }: Props) {
  const context = boardContextFor(listing, services);
  const standing = boardStanding(listing, context, shopApproved);
  const hours = effectiveTurnaroundHours(listing, context.inheritedTurnaroundHours);
  const first = listing.photos[0];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${listing.name || "Untitled listing"}. ${standing.label}.`}
      className="gg-card-flush"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <SamplePhoto
        fileId={first?.fileId}
        altText={first?.altText ?? listing.name}
        emptyLabel="No sample yet"
      />
      <View className="gap-1 px-3 pb-3">
        <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
          {listing.name || "Untitled listing"}
        </Text>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          {subcategoryName(catalog, listing.subcategoryCode)}
        </Text>
        <Text className="text-body text-text-primary" numberOfLines={1}>
          {priceLine(listing)}
        </Text>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          {readyInLine(hours)}
        </Text>
        {standing.label === "On the board" ? null : (
          <View className="mt-1 flex-row">
            <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} />
          </View>
        )}
      </View>
    </Pressable>
  );
}
