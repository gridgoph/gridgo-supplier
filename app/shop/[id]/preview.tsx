import { Eye } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SkeletonBlock } from "@/components/Skeleton";
import { modifierLine } from "@/components/SpecGroupEditor";
import { fileFormatName } from "@/data/fileFormats";
import { formatPhp } from "@/lib/api";
import {
  addOns,
  boardBlockers,
  boardContextFor,
  effectiveFormatCodes,
  effectiveTurnaroundHours,
  priceLine,
  readyInLine,
  specs,
  subcategoryName,
} from "@/lib/listings";
import { BOARD_NOT_OPEN_YET } from "@/lib/listingsApi";
import { useListing } from "@/hooks/useBoard";
import { useThemeColors } from "@/hooks/useTheme";
import { isMatchable, useSession } from "@/store/session";

/**
 * The listing from the other side of the counter.
 *
 * A shop writing its own board reads it as a form it has filled in. A client
 * reads it as a sample, a price and a wait. This screen is that second reading
 * and nothing on it can be edited, which is the point — the only way to find
 * out that a step called "Option 2" means nothing to anybody is to see it where
 * a client would.
 *
 * Whether a client can see it at all is said at the top, plainly, because a
 * preview that looks live and is not is how a shop waits a fortnight for an
 * order that was never possible.
 */
export default function ListingPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const approved = isMatchable(useSession((s) => s.user));
  const { listing, catalog, services, loading, notOpenYet, error, reload } = useListing(id);

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
          title={notOpenYet ? "Your board is not open yet" : "This listing is not reachable"}
          body={notOpenYet ? BOARD_NOT_OPEN_YET : (error ?? "GRIDGO did not return this listing.")}
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  const context = boardContextFor(listing, services);
  const blockers = boardBlockers(listing, context);
  const hours = effectiveTurnaroundHours(listing, context.inheritedTurnaroundHours);
  const formats = effectiveFormatCodes(listing, context.inheritedFormatCodes);
  const visible = listing.onTheBoard && approved && !blockers.length;

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
              : blockers.length
                ? `No client can see this yet. ${blockers[0]}`
                : !listing.onTheBoard
                  ? "No client can see this yet — it is hidden. This is how it would read once it is up."
                  : "Operations has not approved your shop yet, so no client can see this. This is how it will read once they do."}
          </Text>
        </View>

        <View className="mt-6">
          <SamplePhoto
            fileId={listing.photos[0]?.fileId}
            altText={listing.photos[0]?.altText ?? listing.name}
            ratio="wide"
            emptyLabel="No sample photo"
          />
        </View>

        {listing.photos.length > 1 ? (
          <View className="-mx-1.5 mt-1 flex-row flex-wrap">
            {listing.photos.slice(1).map((photo) => (
              <View key={photo.fileId} className="w-1/4 px-1.5">
                <SamplePhoto
                  fileId={photo.fileId}
                  altText={photo.altText ?? listing.name}
                  gutter="tight"
                />
              </View>
            ))}
          </View>
        ) : null}

        <View className="mt-6 gap-2">
          <Text className="text-h2 text-text-primary">{listing.name || "Untitled listing"}</Text>
          <Text className="text-caption text-text-muted">
            {subcategoryName(catalog, listing.subcategoryCode)}
          </Text>
          <Text className="text-h3 text-text-primary">{priceLine(listing)}</Text>
          <Text className="text-body text-text-secondary">{readyInLine(hours)}</Text>
        </View>

        {listing.description ? (
          <Text className="mt-6 text-body text-text-secondary">{listing.description}</Text>
        ) : null}

        {specs(listing).length ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">WHAT THE CLIENT CHOOSES</Text>
            {specs(listing).map((group, index) => (
              <View key={group.id} className="gg-card gap-2">
                <Text className="text-body font-medium text-text-primary">
                  {index + 1}. {group.name}
                  {group.required ? "" : " (optional)"}
                </Text>
                {group.helpText ? (
                  <Text className="text-caption text-text-muted">{group.helpText}</Text>
                ) : null}
                {group.options
                  .filter((option) => option.active)
                  .map((option) => (
                    <View key={option.id} className="flex-row items-center justify-between gap-3">
                      <Text className="min-w-0 flex-1 text-body text-text-secondary">
                        {option.label}
                      </Text>
                      <Text className="text-caption text-text-muted">
                        {modifierLine(option.priceModifierMinor)}
                      </Text>
                    </View>
                  ))}
              </View>
            ))}
          </View>
        ) : null}

        {addOns(listing).length ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">EXTRAS</Text>
            {addOns(listing).map((group) => (
              <View key={group.id} className="gg-card gap-2">
                <Text className="text-body font-medium text-text-primary">{group.name}</Text>
                {group.options
                  .filter((option) => option.active)
                  .map((option) => (
                    <View key={option.id} className="flex-row items-center justify-between gap-3">
                      <Text className="min-w-0 flex-1 text-body text-text-secondary">
                        {option.label}
                      </Text>
                      <Text className="text-caption text-text-muted">
                        {modifierLine(option.priceModifierMinor)}
                      </Text>
                    </View>
                  ))}
              </View>
            ))}
          </View>
        ) : null}

        <View className="mt-8 gap-2">
          <Text className="text-overline text-text-muted">ARTWORK YOU ACCEPT</Text>
          <Text className="text-body text-text-secondary">
            {formats.length
              ? formats.map(fileFormatName).join(", ")
              : "Not set yet, so a client would not know what to send."}
          </Text>
        </View>

        <Text className="mt-8 text-caption text-text-muted">
          A client pays GRIDGO, not your counter, and GRIDGO’s own charge sits on top of the
          {` ${formatPhp(listing.basePriceMinor)} `}
          you set here. What you are paid is your price.
        </Text>
      </ScrollView>
    </View>
  );
}
