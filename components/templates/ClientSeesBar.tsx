import { Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";

/**
 * "Clients see" — the product as a client meets it, pinned above the foot on
 * every step of adding a GRIDGO product.
 *
 * It fills in as the shop works: the name and photo once a product is ticked,
 * the lowest price once one is typed, the ready time once a chip is picked.
 * Lines not answered yet say what will go there rather than vanish, so the bar
 * never jumps in height under the thumb.
 */
export function ClientSeesBar({
  name,
  photoUrl,
  photoAlt,
  priceLine,
  readyLine,
  realPhoto = false,
}: {
  name: string | null;
  photoUrl: string | null;
  photoAlt?: string;
  priceLine: string | null;
  readyLine: string | null;
  realPhoto?: boolean;
}) {
  return (
    <View
      className="mx-4 mb-3 rounded-card border border-outline bg-surface p-3"
      accessibilityLabel={`Clients see: ${name ?? "your product"}. ${priceLine ?? "No price yet"}. ${readyLine ?? "No ready time yet"}.`}
      testID="client-sees-bar"
    >
      <Text className="text-caption text-text-muted">Clients see</Text>
      <View className="mt-2 flex-row items-center gap-3">
        <View className="w-14 shrink-0">
          <SamplePhoto url={photoUrl} altText={photoAlt ?? name ?? "Product photo"} gutter="tight" emptyLabel="Photo" enlarge={false} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
            {name ?? "Tick a product"}
          </Text>
          <Text className={priceLine ? "text-caption text-text-secondary" : "text-caption text-text-muted"} numberOfLines={1}>
            {priceLine ?? "Price shows here"}
          </Text>
          <Text className={readyLine ? "text-caption text-text-secondary" : "text-caption text-text-muted"} numberOfLines={1}>
            {readyLine ?? "Ready time shows here"}
          </Text>
        </View>
        {photoUrl ? (
          <View className="self-start rounded-pill border border-outline px-2 py-0.5">
            <Text className="text-caption text-text-muted">{realPhoto ? "Real photo" : "GRIDGO photo"}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
