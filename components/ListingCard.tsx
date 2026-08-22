import { Pressable, Text, View } from "react-native";

import { HuntedName } from "@/components/HuntedName";
import { SamplePhoto } from "@/components/SamplePhoto";
import { StatusChip } from "@/components/StatusChip";
import {
  boardContextFor,
  boardStanding,
  priceLine,
  subcategoryName,
  type Listing,
  type ServiceLine,
} from "@/lib/listings";
import type { ServiceCatalog } from "@/lib/taxonomy";

type Props = {
  listing: Listing;
  catalog: ServiceCatalog | null;
  services: ServiceLine[];
  shopApproved: boolean;
  onPress: () => void;
  /** Press and hold. Absent while another tile is being removed. */
  onRemove?: () => void;
  /** The hunt this tile came back for, so the matching run can be marked. */
  hunt?: string;
};

/**
 * One sample on the wall.
 *
 * The photo leads because that is what a client picks with, and it sits in its
 * crop-mark frame so the wall reads as print samples rather than a shelf of
 * products. Under it, the two facts a shop checks when it glances at its own
 * board: what it is called, and what it costs. How fast it goes out lives on
 * the list and inside the listing.
 *
 * The chip is only drawn when something is wrong or hidden. A tile that is up
 * and finished says so by being plain — a wall of green ticks is a wall nobody
 * reads.
 *
 * Removing one is a press and hold rather than a control on every tile. A wall
 * of samples with a bin drawn on each of them stops reading as a wall, and the
 * hold is the gesture a phone already uses for "do something to this one" — so
 * a screen reader is offered the same thing as a named action rather than a
 * gesture it cannot make.
 */
export function ListingCard({
  listing,
  catalog,
  services,
  shopApproved,
  onPress,
  onRemove,
  hunt,
}: Props) {
  const context = boardContextFor(listing, services);
  const standing = boardStanding(listing, context, shopApproved);
  const first = listing.photos[0];

  return (
    <View collapsable={false} className="rounded-card border border-outline bg-surface">
      <Pressable
        onPress={onPress}
        onLongPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`${listing.name || "Untitled listing"}. ${standing.label}.`}
        accessibilityHint={onRemove ? "Press and hold to remove this listing." : undefined}
        accessibilityActions={onRemove ? [{ name: "remove", label: "Remove this listing" }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "remove") onRemove?.();
        }}
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <SamplePhoto
          fileId={first?.fileId}
          altText={first?.altText ?? listing.name}
          emptyLabel="No sample yet"
        />
        <View className="gap-1 px-3 pb-3">
          <HuntedName
            name={listing.name || "Untitled listing"}
            hunt={hunt ?? ""}
            className="text-body font-medium text-text-primary"
            numberOfLines={2}
          />
          <Text className="text-caption text-text-muted" numberOfLines={1}>
            {subcategoryName(catalog, listing.subcategoryCode)}
          </Text>
          <Text className="text-body text-text-primary" numberOfLines={1}>
            {priceLine(listing)}
          </Text>
          {standing.label === "On the board" ? null : (
            <View className="mt-1 flex-row">
              <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} />
            </View>
          )}
        </View>
      </Pressable>
    </View>
  );
}
