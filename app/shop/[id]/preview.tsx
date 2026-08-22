import { Eye } from "lucide-react-native";
import { ScrollView, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { PrepStepRow } from "@/components/PrepStepEditor";
import { SamplePhoto } from "@/components/SamplePhoto";
import { SkeletonBlock } from "@/components/Skeleton";
import { modifierLine } from "@/components/SpecGroupEditor";
import { fileFormatName, isLinkFormat, PUBLISHED_FILE_FORMATS } from "@/data/fileFormats";
import { formatPhp } from "@/lib/api";
import {
  addOns,
  boardBlockers,
  boardContextFor,
  effectiveFormatCodes,
  effectiveTurnaroundHours,
  fromPriceMinor,
  hasPriceRange,
  pickLine,
  readyInLine,
  specs,
  subcategoryName,
  unitLine,
  type SpecGroup,
} from "@/lib/listings";
import { BOARD_NOT_OPEN_YET } from "@/lib/listingsApi";
import { routeId, useListing } from "@/hooks/useBoard";
import { useThemeColors } from "@/hooks/useTheme";
import { isMatchable, useSession } from "@/store/session";

/**
 * The listing from the other side of the counter.
 *
 * A shop writing its own board reads it as a form it has filled in. A client
 * reads it as a sample, a price and a wait — and then as an order sheet: pick
 * one of these, add any of those, here is what each one costs. This screen is
 * that second reading, laid out the way the client app will lay it out, and
 * nothing on it can be edited. Seeing a step called "Option 2" where a client
 * would see it is the only reliable way to find out it means nothing.
 *
 * Whether a client can see it at all is said at the top, plainly, because a
 * preview that looks live and is not is how a shop waits a fortnight for an
 * order that was never possible.
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
  const blockers = boardBlockers(listing, context);
  const hours = effectiveTurnaroundHours(listing, context.inheritedTurnaroundHours);
  const formats = effectiveFormatCodes(listing, context.inheritedFormatCodes);
  const uploads = formats.filter(
    (code) => PUBLISHED_FILE_FORMATS.find((format) => format.code === code)?.uploadable === true,
  );
  const links = formats.filter((code) => isLinkFormat(code));
  const unopened = formats.filter((code) => !uploads.includes(code) && !links.includes(code));
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-1">
            <View className="flex-row">
              {listing.photos.slice(1).map((photo) => (
                <View key={photo.fileId} className="w-20">
                  <SamplePhoto
                    fileId={photo.fileId}
                    altText={photo.altText ?? listing.name}
                    gutter="tight"
                  />
                </View>
              ))}
            </View>
          </ScrollView>
        ) : null}

        <View className="mt-6 gap-2">
          <Text className="text-h2 text-text-primary">{listing.name || "Untitled listing"}</Text>
          <Text className="text-caption text-text-muted">
            {subcategoryName(catalog, listing.subcategoryCode)}
          </Text>
          {/*
            The headline price is the cheapest a client can leave with: the
            shop's own base plus the cheapest option of every step they must
            answer. "From" appears only when a step can push it up, because a
            fixed price that says "from" is a price nobody trusts.
          */}
          <View className="flex-row items-baseline gap-2">
            {hasPriceRange(listing) ? (
              <Text className="text-caption text-text-muted">From</Text>
            ) : null}
            <Text className="text-h1 text-text-primary">
              {formatPhp(fromPriceMinor(listing))}
            </Text>
            <Text className="text-body text-text-secondary">{unitLine(listing)}</Text>
          </View>
          <Text className="text-body text-text-secondary">{readyInLine(hours)}</Text>
        </View>

        {listing.description ? (
          <Text className="mt-6 text-body text-text-secondary">{listing.description}</Text>
        ) : null}

        {prepSteps.length ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">BEFORE YOU ORDER</Text>
            {prepSteps.map((step, index) => (
              <PrepStepRow key={step.id} step={step} position={index + 1} busy={false} />
            ))}
          </View>
        ) : null}

        {specs(listing).map((group, index) => (
          <OrderGroup key={group.id} group={group} step={index + 1} />
        ))}

        {addOns(listing).length ? (
          <View className="mt-8 gap-3">
            <Text className="text-overline text-text-muted">ADD ANYTHING ELSE</Text>
            {addOns(listing).map((group) => (
              <OrderGroup key={group.id} group={group} step={null} />
            ))}
          </View>
        ) : null}

        <View className="mt-8 gap-3">
          <Text className="text-overline text-text-muted">SEND YOUR ARTWORK AS</Text>
          {uploads.length ? (
            <Text className="text-body text-text-secondary">
              Upload {uploads.map(fileFormatName).join(", ")}
            </Text>
          ) : null}
          {links.length ? (
            <Text className="text-body text-text-secondary">
              Or paste a link from {links.map(fileFormatName).join(", ")}
            </Text>
          ) : null}
          {unopened.length ? (
            <Text className="text-body text-text-secondary">
              {unopened.map(fileFormatName).join(", ")} cannot be uploaded in GRIDGO yet —
              send them as a link.
            </Text>
          ) : null}
          {!formats.length ? (
            <Text className="text-body text-text-secondary">
              Not set yet, so a client would not know what to send.
            </Text>
          ) : null}
        </View>

        <Text className="mt-8 text-caption text-text-muted">
          A client pays GRIDGO, not your counter, and GRIDGO’s own charge sits on top of the
          price you set. What you are paid is your price.
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * One group, as an order sheet reads it.
 *
 * Name, then whether it must be answered, then the choices with their money in
 * one right-aligned column — the shape of every food order anyone in Davao has
 * used. A step keeps its number because the order is real; an add-on does not,
 * because a client ticks those in any order they like.
 */
function OrderGroup({ group, step }: { group: SpecGroup; step: number | null }) {
  const options = group.options.filter((option) => option.active);

  return (
    <View className={step != null ? "mt-8 gap-3" : "gap-3"}>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="min-w-0 flex-1 text-overline text-text-muted">
          {step != null ? `STEP ${step} · ${group.name.toUpperCase()}` : group.name.toUpperCase()}
        </Text>
        <View className="rounded-pill border border-outline px-2 py-0.5">
          <Text className="text-caption text-text-secondary">{pickLine(group)}</Text>
        </View>
      </View>
      {group.helpText ? (
        <Text className="text-caption text-text-muted">{group.helpText}</Text>
      ) : null}
      <View className="gg-card gap-3">
        {options.length ? (
          options.map((option) => (
            <View key={option.id} className="flex-row items-center gap-3">
              <Marker mustAnswer={group.required} />
              <Text className="min-w-0 flex-1 text-body text-text-primary">{option.label}</Text>
              <Text className="text-body text-text-secondary">
                {modifierLine(option.priceModifierMinor)}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-body text-text-muted">
            Nothing to pick here yet, so a client cannot order this.
          </Text>
        )}
      </View>
    </View>
  );
}

/**
 * The empty control beside a choice.
 *
 * A circle where a client has to answer and a square where it may skip — the
 * two shapes every order sheet on a phone already uses, so the "Pick 1" chip is
 * read once and confirmed by the rows under it. Every group is single-select
 * for now, so a square today means optional rather than multiple; when the
 * platform opens multi-select, the square is already the right shape and only
 * this comment changes.
 *
 * All of them are empty. This is the sheet a client is handed, not an order in
 * progress, and a pre-ticked preview would show a price nobody has agreed to.
 */
function Marker({ mustAnswer }: { mustAnswer: boolean }) {
  return (
    <View
      className={`h-[18px] w-[18px] border border-outline ${mustAnswer ? "rounded-pill" : "rounded-sm"}`}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
