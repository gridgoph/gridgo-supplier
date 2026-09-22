import { Pressable, ScrollView, Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import { photoViewUrl, type Listing } from "@/lib/listings";

/**
 * Every sample, in a row.
 *
 * A wall of samples is a row, not a grid: horizontal keeps the next section
 * above the fold on a small phone, and it makes "the first one is your board
 * photo" mean the leftmost one, which is how a strip is read. All of them are
 * drawn — a shop that added six and saw four believed two had not saved.
 */
export function SampleStrip({
  listing,
  onRemove,
}: {
  listing: Listing;
  onRemove?: (fileId: string) => void;
}) {
  if (!listing.photos.length) {
    return (
      <View className="w-1/2">
        <SamplePhoto gutter="tight" emptyLabel="No samples yet" />
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel={`${listing.photos.length} sample photos`}
    >
      <View className="flex-row">
        {listing.photos.map((photo, index) => (
          <View key={photo.fileId} className="w-28">
            <SamplePhoto
              fileId={photo.fileId}
              url={photoViewUrl(photo)}
              altText={photo.altText ?? listing.name}
              gutter="tight"
            />
            <Text className="px-1.5 text-caption text-text-muted" numberOfLines={1}>
              {index === 0 ? "Board photo" : `Sample ${index + 1}`}
            </Text>
            {onRemove ? (
              <Pressable
                onPress={() => onRemove(photo.fileId)}
                accessibilityRole="button"
                accessibilityLabel={
                  index === 0 ? "Remove board photo" : `Remove sample ${index + 1}`
                }
                className="gg-touch justify-center px-1.5"
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
              >
                <Text className="text-caption text-error">Remove</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
