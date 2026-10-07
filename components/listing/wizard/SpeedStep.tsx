import { Text } from "react-native";

import { Stepper } from "@/components/controls/Stepper";
import { ListingSection } from "@/components/listing/ListingSection";
import { PRODUCTION_DAYS_HINT, ProductionDaysField } from "@/components/listing/ProductionDaysField";
import { PriceTierEditor } from "@/components/listing/TierEditor";
import { asksQuantity, unitLine, type BoardContext, type Listing } from "@/lib/listings";
import { applyDraft, PACK_STEP, type ListingDraft } from "@/lib/listingDraft";
import { productionDays } from "@/lib/listingWizard";

type Props = {
  listing: Listing;
  working: ListingDraft;
  context: BoardContext;
  onChange: (next: ListingDraft) => void;
};

export function SpeedStep({ listing, working, context, onChange }: Props) {
  const merged = applyDraft(listing, working);
  const { min, max } = productionDays(working, context.inheritedTurnaroundDays);

  function setWindow({ minDays, maxDays }: { minDays: number; maxDays: number }) {
    onChange({
      ...working,
      turnaroundMode: "override",
      minimumTurnaroundDays: minDays,
      turnaroundDays: maxDays,
      speedTiers: [],
    });
  }

  return (
    <>
      {working.pricingUnit === "per_package" ? (
        <ListingSection title="HOW MANY PIECES IN A PACK">
          <Stepper
            value={working.packageQty ?? 100}
            onChange={(value) => onChange({ ...working, packageQty: value })}
            min={2}
            max={5000}
            step={PACK_STEP}
            unit="pieces"
            accessibilityLabel="Pieces in a pack"
          />
        </ListingSection>
      ) : null}

      {asksQuantity(working.pricingUnit) ? (
        <ListingSection title="BULK BREAKS">
          <PriceTierEditor
            tiers={working.priceTiers}
            unitLabel={unitLine(merged)}
            onChange={(next) => onChange({ ...working, priceTiers: next })}
          />
        </ListingSection>
      ) : null}

      {asksQuantity(working.pricingUnit) ? (
        <ListingSection title="HOW MANY IS YOUR MINIMUM ORDER?">
          <Stepper
            value={working.minimumOrderQuantity ?? 0}
            onChange={(value) =>
              onChange({ ...working, minimumOrderQuantity: value || null })
            }
            min={0}
            max={1000}
            step={1}
            unit={working.minimumOrderQuantity ? "minimum" : "no minimum"}
            accessibilityLabel="Smallest order you will take"
          />
        </ListingSection>
      ) : null}

      <ListingSection title="PRODUCTION TIME" hint={PRODUCTION_DAYS_HINT}>
        <ProductionDaysField minDays={min} maxDays={max} onChange={setWindow} />
        {context.inheritedTurnaroundDays && working.turnaroundDays == null ? (
          <Text className="text-caption text-text-muted">
            Starts from your usual time for this category. Change either number for just this listing.
          </Text>
        ) : null}
      </ListingSection>
    </>
  );
}
