import { Pressable, Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import {
  boardContextFor,
  effectiveTurnaroundHours,
  photoViewUrl,
  priceLine,
  readyInLine,
  type Listing,
  type ServiceLine,
} from "@/lib/listings";

type Props = {
  listing: Listing;
  services: ServiceLine[];
  onPress?: () => void;
};

/**
 * Compact "what clients see" facts, pinned above the wizard foot.
 *
 * Reuses listing formatters — not a second price line. A tap opens the
 * client's-eye preview, not the editor.
 */
export function ClientPreviewCard({ listing, services, onPress }: Props) {
  const context = boardContextFor(listing, services);
  const hours = effectiveTurnaroundHours(listing, context.inheritedTurnaroundHours);
  const name = listing.name.trim() || "Untitled listing";

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel="See what clients see"
      className="mx-4 mb-3 rounded-card border border-outline bg-surface p-3"
      style={({ pressed }) => (pressed && onPress ? { opacity: 0.7 } : undefined)}
    >
      <Text className="text-overline text-text-muted">SEE WHAT CLIENTS SEE</Text>
      <View className="mt-3 flex-row items-center gap-3">
        <View className="w-16 shrink-0">
          <SamplePhoto
            fileId={listing.photos[0]?.fileId}
            url={photoViewUrl(listing.photos[0])}
            altText={listing.photos[0]?.altText ?? name}
            gutter="tight"
            emptyLabel="No sample"
            enlarge={false}
          />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
            {name}
          </Text>
          <Text className="text-caption text-text-secondary" numberOfLines={1}>
            {priceLine(listing)}
          </Text>
          <Text className="text-caption text-text-muted" numberOfLines={1}>
            {readyInLine(hours, listing.minimumTurnaroundHours)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
