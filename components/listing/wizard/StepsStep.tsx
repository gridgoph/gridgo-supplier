import { Text } from "react-native";

import { AddGroupButton, SpecGroupEditor } from "@/components/SpecGroupEditor";
import { ListingSection } from "@/components/listing/ListingSection";
import { addOns, LISTING_CAPS, specs, type Listing, type SpecGroup } from "@/lib/listings";

type Props = {
  listing: Listing;
  merged: Listing;
  busy: boolean;
  onSetRequired: (group: SpecGroup, required: boolean) => void;
  onAddOption: (
    group: SpecGroup,
    label: string,
    minor: number,
    multiplier: number | null,
  ) => Promise<boolean>;
  onRemoveOption: (group: SpecGroup, optionId: string) => void;
  onRemoveGroup: (group: SpecGroup) => void;
  onAddGroup: (input: {
    name: string;
    kind: "spec" | "addon";
    required: boolean;
    firstOption: { label: string; priceModifierMinor: number };
  }) => Promise<boolean>;
};

export function StepsStep({
  listing,
  merged,
  busy,
  onSetRequired,
  onAddOption,
  onRemoveOption,
  onRemoveGroup,
  onAddGroup,
}: Props) {
  return (
    <>
      <ListingSection
        title="WHAT A CLIENT PICKS"
        hint="In this order, the way they will see it. Each one saves as you add it."
      >
        {specs(merged).map((group, index) => (
          <SpecGroupEditor
            key={group.id}
            group={group}
            step={index + 1}
            busy={busy}
            onSetRequired={(required) => onSetRequired(group, required)}
            onAddOption={(label, minor, multiplier) =>
              onAddOption(group, label, minor, multiplier)
            }
            onRemoveOption={(optionId) => onRemoveOption(group, optionId)}
            onRemoveGroup={() => onRemoveGroup(group)}
          />
        ))}
        {merged.groups.length < LISTING_CAPS.specGroups ? (
          <AddGroupButton
            kind="spec"
            busy={busy}
            onAdd={(input) =>
              onAddGroup({
                name: input.name,
                kind: "spec",
                required: true,
                firstOption: input.firstOption,
              })
            }
          />
        ) : (
          <Text className="text-caption text-text-muted">
            That is all six steps and add-ons. Remove one before adding another.
          </Text>
        )}
      </ListingSection>

      <ListingSection
        title="ADD-ONS"
        hint="Priced extras a client can add. Rush, grommets, lamination."
      >
        {addOns(merged).map((group) => (
          <SpecGroupEditor
            key={group.id}
            group={group}
            step={null}
            busy={busy}
            onSetRequired={() => undefined}
            onAddOption={(label, minor, multiplier) =>
              onAddOption(group, label, minor, multiplier)
            }
            onRemoveOption={(optionId) => onRemoveOption(group, optionId)}
            onRemoveGroup={() => onRemoveGroup(group)}
          />
        ))}
        {merged.groups.length < LISTING_CAPS.specGroups ? (
          <AddGroupButton
            kind="addon"
            busy={busy}
            onAdd={(input) =>
              onAddGroup({
                name: input.name,
                kind: "addon",
                required: false,
                firstOption: input.firstOption,
              })
            }
          />
        ) : null}
      </ListingSection>
    </>
  );
}
