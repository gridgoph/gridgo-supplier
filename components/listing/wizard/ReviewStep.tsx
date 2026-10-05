import { Text, View } from "react-native";

import { ListingPreviewBody } from "@/components/listing/ListingPreviewBody";
import {
  boardStanding,
  type BoardContext,
  type Listing,
  type PrepStep,
  type ServiceLine,
} from "@/lib/listings";
import type { ServiceCatalog } from "@/lib/taxonomy";

type Props = {
  /** GRIDGO reviews listings, so this step sends it to Operations. */
  reviewed: boolean;
  listing: Listing;
  catalog: ServiceCatalog | null;
  services: ServiceLine[];
  prepSteps: PrepStep[];
  context: BoardContext;
  shopApproved: boolean;
};

export function ReviewStep({
  reviewed,
  listing,
  catalog,
  services,
  prepSteps,
  context,
  shopApproved,
}: Props) {
  const standing = boardStanding(listing, context, shopApproved);

  return (
    <View className="mt-6">
      {reviewed ? (
        <View className="gg-panel mb-6 gap-2">
          <Text className="text-body font-medium text-text-primary">
            Operations checks every new listing before clients see it
          </Text>
          <Text className="text-body text-text-secondary">
            They look at the price, the choices and every sample photo. A photo with a watermark,
            logo or your shop’s name on it is sent back. You get an alert when they decide.
          </Text>
        </View>
      ) : null}
      {standing.kind === "waiting_approval" ? (
        <Text className="mb-6 text-body text-text-secondary">
          {standing.note ?? standing.label}
        </Text>
      ) : null}
      <ListingPreviewBody
        listing={listing}
        catalog={catalog}
        services={services}
        prepSteps={prepSteps}
      />
    </View>
  );
}
