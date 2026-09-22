import { ScrollView, Text, View } from "react-native";

import { PrepStepRow } from "@/components/PrepStepEditor";
import { SamplePhoto } from "@/components/SamplePhoto";
import { modifierLine } from "@/components/SpecGroupEditor";
import { fileFormatName, isLinkFormat, PUBLISHED_FILE_FORMATS } from "@/data/fileFormats";
import { formatPhp } from "@/lib/api";
import {
  addOns,
  boardContextFor,
  effectiveFormatCodes,
  effectiveTurnaroundHours,
  fromPriceMinor,
  hasPriceRange,
  photoViewUrl,
  pickLine,
  printerCapLine,
  readyInLine,
  specs,
  subcategoryName,
  unitLine,
  type Listing,
  type PrepStep,
  type ServiceLine,
  type SpecGroup,
} from "@/lib/listings";
import type { ServiceCatalog } from "@/lib/taxonomy";

/**
 * The listing from the other side of the counter — sample, price, wait, then
 * the order sheet. Nothing here can be edited.
 */
export function ListingPreviewBody({
  listing,
  catalog,
  services,
  prepSteps,
}: {
  listing: Listing;
  catalog: ServiceCatalog | null;
  services: ServiceLine[];
  prepSteps: PrepStep[];
}) {
  const context = boardContextFor(listing, services);
  const hours = effectiveTurnaroundHours(listing, context.inheritedTurnaroundHours);
  const formats = effectiveFormatCodes(listing, context.inheritedFormatCodes);
  const uploads = formats.filter(
    (code) => PUBLISHED_FILE_FORMATS.find((format) => format.code === code)?.uploadable === true,
  );
  const links = formats.filter((code) => isLinkFormat(code));
  const unopened = formats.filter((code) => !uploads.includes(code) && !links.includes(code));

  return (
    <View>
      <View>
        <SamplePhoto
          fileId={listing.photos[0]?.fileId}
          url={photoViewUrl(listing.photos[0])}
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
                  url={photoViewUrl(photo)}
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
        {printerCapLine(listing) ? (
          <Text className="text-caption text-text-muted">{printerCapLine(listing)}</Text>
        ) : null}
        <View className="flex-row items-baseline gap-2">
          {hasPriceRange(listing) ? (
            <Text className="text-caption text-text-muted">From</Text>
          ) : null}
          <Text className="text-h1 text-text-primary">
            {formatPhp(fromPriceMinor(listing))}
          </Text>
          <Text className="text-body text-text-secondary">{unitLine(listing)}</Text>
        </View>
        <Text className="text-body text-text-secondary">
          {readyInLine(hours, listing.minimumTurnaroundHours)}
        </Text>
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
            Upload {uploads.map((code) => fileFormatName(code)).join(", ")}
          </Text>
        ) : null}
        {links.length ? (
          <Text className="text-body text-text-secondary">
            Or paste a link from {links.map((code) => fileFormatName(code)).join(", ")}
          </Text>
        ) : null}
        {unopened.length ? (
          <Text className="text-body text-text-secondary">
            {unopened.map((code) => fileFormatName(code)).join(", ")} cannot be uploaded in GRIDGO yet —
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
    </View>
  );
}

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

function Marker({ mustAnswer }: { mustAnswer: boolean }) {
  return (
    <View
      className={`h-[18px] w-[18px] border border-outline ${mustAnswer ? "rounded-pill" : "rounded-sm"}`}
      aria-hidden
    />
  );
}
