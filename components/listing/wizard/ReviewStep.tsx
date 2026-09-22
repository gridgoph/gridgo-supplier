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
  listing: Listing;
  catalog: ServiceCatalog | null;
  services: ServiceLine[];
  prepSteps: PrepStep[];
  context: BoardContext;
  shopApproved: boolean;
};

export function ReviewStep({
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
