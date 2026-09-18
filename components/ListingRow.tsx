import { Pressable, Text, View } from "react-native";

import { HuntedName } from "@/components/HuntedName";
import { SamplePhoto } from "@/components/SamplePhoto";
import { StatusChip } from "@/components/StatusChip";
import { formatPhp } from "@/lib/api";
import {
  boardContextFor,
  boardStanding,
  effectiveTurnaroundHours,
  fromPriceMinor,
  hasPriceRange,
  priceLine,
  readyInLine,
  subcategoryName,
  unitLine,
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
  onRemove?: () => void;
  /** The hunt this strip came back for, so the matching run can be marked. */
  hunt?: string;
};

/**
 * One listing as a quote strip.
 *
 * The wall is for looking; this is for scanning. Sample on the left, what it is
 * in the middle, the peso amount *and how it is sold* on the right — per piece
 * or per pack is the difference between a ₱300 flyer and a ₱300 pack of a
 * hundred, and a quote that drops the unit is not a quote a shop can stand by.
 */
export function ListingRow({
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
  const hours = effectiveTurnaroundHours(listing, context.inheritedTurnaroundHours);
  const first = listing.photos[0];
  const money = formatPhp(fromPriceMinor(listing));

  return (
    <View collapsable={false} className="rounded-card border border-outline bg-surface">
      <Pressable
        onPress={onPress}
        onLongPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`${listing.name || "Untitled listing"}. ${priceLine(listing)}. ${standing.label}.`}
        accessibilityHint={onRemove ? "Press and hold to remove this listing." : undefined}
        accessibilityActions={onRemove ? [{ name: "remove", label: "Remove this listing" }] : undefined}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "remove") onRemove?.();
        }}
        className="flex-row items-start gap-3 py-1 pr-4"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="w-28 shrink-0">
          <SamplePhoto
            fileId={first?.fileId}
            altText={first?.altText ?? listing.name}
            emptyLabel="No sample yet"
            gutter="tight"
          />
        </View>
        <View className="min-w-0 flex-1 gap-1 py-3">
          <HuntedName
            name={listing.name || "Untitled listing"}
            hunt={hunt ?? ""}
            className="text-body font-medium text-text-primary"
            numberOfLines={2}
          />
          <Text className="text-caption text-text-muted" numberOfLines={1}>
            {subcategoryName(catalog, listing.subcategoryCode)}
          </Text>
          <Text className="text-caption text-text-muted" numberOfLines={1}>
            {readyInLine(hours)}
          </Text>
          <View className="mt-0.5 flex-row flex-wrap">
            <StatusChip tone={standing.tone} icon={standing.icon} label={standing.label} />
          </View>
        </View>
        <View className="max-w-[42%] shrink-0 items-end gap-0.5 py-3">
          <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
            {hasPriceRange(listing) ? `From ${money}` : money}
          </Text>
          <Text className="text-right text-caption text-text-secondary" numberOfLines={2}>
            {unitLine(listing)}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}
