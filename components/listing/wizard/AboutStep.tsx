import { Text } from "react-native";

import { NoteField } from "@/components/controls/NoteField";
import { TextField } from "@/components/controls/TextField";
import { DestinationRow } from "@/components/listing/DestinationRow";
import { ListingSection } from "@/components/listing/ListingSection";
import { SampleStrip } from "@/components/listing/SampleStrip";
import { LISTING_CAPS, type Listing } from "@/lib/listings";
import type { ListingDraft } from "@/lib/listingDraft";

type Props = {
  listing: Listing;
  working: ListingDraft;
  onChange: (next: ListingDraft) => void;
  onPhotos: () => void;
  onRemovePhoto?: (fileId: string) => void;
};

export function AboutStep({ listing, working, onChange, onPhotos, onRemovePhoto }: Props) {
  return (
    <>
      <ListingSection
        title="SAMPLE PHOTOS"
        hint={
          listing.photos.length
            ? "The first one is what clients see on your board."
            : "A listing cannot go on the board without one."
        }
      >
        <SampleStrip listing={listing} onRemove={onRemovePhoto} />
        <DestinationRow
          title={listing.photos.length ? "Edit photos" : "Add a sample photo"}
          detail={`${listing.photos.length} of ${LISTING_CAPS.photos} used.`}
          onPress={onPhotos}
        />
      </ListingSection>

      <ListingSection title="WHAT IT IS">
        <TextField
          value={working.name}
          onChange={(value) => onChange({ ...working, name: value.slice(0, LISTING_CAPS.nameChars) })}
          placeholder="Tarpaulin, 13oz"
          accessibilityLabel="Listing name"
          kind="text"
        />
        <Text className="text-caption text-text-muted">
          Name it the way a client would ask for it at your counter.
        </Text>
      </ListingSection>

      <ListingSection title="WHAT A CLIENT GETS, IN YOUR WORDS">
        <NoteField
          value={working.description}
          onChange={(value) => onChange({ ...working, description: value })}
          placeholder="What a client gets, in your own words."
          accessibilityLabel="What this listing is"
          maxLength={LISTING_CAPS.descriptionChars}
        />
      </ListingSection>
    </>
  );
}
