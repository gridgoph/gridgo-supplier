import { Text } from "react-native";

import { Stepper } from "@/components/controls/Stepper";
import { ListingSection } from "@/components/listing/ListingSection";
import { PriceTierEditor } from "@/components/listing/TierEditor";
import { asksQuantity, unitLine, type BoardContext, type Listing } from "@/lib/listings";
import { applyDraft, PACK_STEP, type ListingDraft } from "@/lib/listingDraft";
import { productionHours } from "@/lib/listingWizard";

type Props = {
  listing: Listing;
  working: ListingDraft;
  context: BoardContext;
  onChange: (next: ListingDraft) => void;
};

export function SpeedStep({ listing, working, context, onChange }: Props) {
  const merged = applyDraft(listing, working);
  const { min, max } = productionHours(working, context.inheritedTurnaroundHours);

  function setWindow(nextMin: number, nextMax: number) {
    const soonest = Math.max(1, Math.min(nextMin, nextMax));
    const latest = Math.max(soonest, nextMax);
    onChange({
      ...working,
      turnaroundMode: "override",
      minimumTurnaroundHours: soonest,
      turnaroundHours: latest,
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

      <ListingSection
        title="PRODUCTION TIME"
        hint="The soonest you can finish, and the latest you will take. A client sees this as ready-in time."
      >
        <Stepper
          value={min}
          onChange={(value) => setWindow(value, max)}
          min={1}
          max={336}
          step={1}
          unit="hours minimum"
          accessibilityLabel="Minimum production time"
        />
        <Stepper
          value={max}
          onChange={(value) => setWindow(min, value)}
          min={1}
          max={336}
          step={1}
          unit="hours maximum"
          accessibilityLabel="Maximum production time"
        />
        {context.inheritedTurnaroundHours && working.turnaroundHours == null ? (
          <Text className="text-caption text-text-muted">
            Starts from your usual time for this category. Change either number for just this listing.
          </Text>
        ) : null}
      </ListingSection>
    </>
  );
}
