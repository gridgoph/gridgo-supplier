import { Eye } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ListingPreviewBody } from "@/components/listing/ListingPreviewBody";
import { SkeletonBlock } from "@/components/Skeleton";
import { boardContextFor, boardStanding } from "@/lib/listings";
import { BOARD_NOT_OPEN_YET } from "@/lib/listingsApi";
import { routeId, useListing } from "@/hooks/useBoard";
import { useThemeColors } from "@/hooks/useTheme";
import { isMatchable, useSession } from "@/store/session";

/**
 * The listing from the other side of the counter.
 *
 * A shop writing its own board reads it as a form it has filled in. A client
 * reads it as a sample, a price and a wait — and then as an order sheet. This
 * screen is that second reading. Whether a client can see it at all is said
 * at the top, plainly.
 */
export default function ListingPreviewScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = routeId(params.id);
  const colors = useThemeColors();
  const approved = isMatchable(useSession((s) => s.user));
  const { listing, catalog, services, prepSteps, loading, notOpenYet, error, reload } =
    useListing(id);

  if (loading && !listing) {
    return (
      <View
        className="gg-screen gg-page pt-4"
        accessibilityRole="progressbar"
        accessibilityLabel="Loading the preview"
      >
        <SkeletonBlock className="h-56 w-full rounded-card" />
        <View className="mt-6 gap-3">
          <SkeletonBlock className="h-7 w-2/3" />
          <SkeletonBlock className="h-5 w-1/3" />
          <SkeletonBlock className="h-4 w-full" />
        </View>
      </View>
    );
  }

  if (notOpenYet || !listing) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title={notOpenYet ? "Your board is not open yet" : "This listing did not load"}
          body={
            notOpenYet
              ? BOARD_NOT_OPEN_YET
              : (error ?? "GRIDGO did not answer for this listing. Try again in a moment.")
          }
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  const context = boardContextFor(listing, services);
  const standing = boardStanding(listing, context, approved);
  const visible = standing.kind === "live";

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-start gap-3 rounded-field border border-outline bg-surface-variant p-3">
          <View className="pt-0.5">
            <Eye size={16} color={colors.textMuted} strokeWidth={2} />
          </View>
          <Text className="min-w-0 flex-1 text-caption text-text-secondary">
            {visible
              ? "This is what a client sees today."
              : standing.kind === "not_ready"
                ? `No client can see this yet. ${standing.note ?? standing.label}`
                : standing.kind === "hidden"
                  ? "No client can see this yet — it is hidden. This is how it would read once it is up."
                  : "Operations has not approved your shop yet, so no client can see this. This is how it will read once they do."}
          </Text>
        </View>

        <View className="mt-6">
          <ListingPreviewBody
            listing={listing}
            catalog={catalog}
            services={services}
            prepSteps={prepSteps}
          />
        </View>
      </ScrollView>
    </View>
  );
}
