import { Stepper } from "@/components/controls/Stepper";
import { CATALOG_COUNT_MAX } from "@/lib/catalogBounds";
import { ListingSection } from "@/components/listing/ListingSection";
import { ProductionTimeSection } from "@/components/listing/ProductionTimeQuestion";
import { PriceTierEditor } from "@/components/listing/TierEditor";
import { asksQuantity, unitLine, type BoardContext, type Listing } from "@/lib/listings";
import { applyDraft, colourOn, PACK_STEP, withProductionWindow, type ListingDraft } from "@/lib/listingDraft";
import { wizardProductionTime } from "@/lib/listingWizard";

type Props = {
  listing: Listing;
  working: ListingDraft;
  context: BoardContext;
  onChange: (next: ListingDraft) => void;
  busy: boolean;
  /** "Use for all my listings": saves the wizard's changes first. */
  beforeApply: () => Promise<boolean>;
  afterApply: () => Promise<void>;
};

export function SpeedStep({ listing, working, context, onChange, busy, beforeApply, afterApply }: Props) {
  const merged = applyDraft(listing, working);

  return (
    <>
      {working.pricingUnit === "per_package" ? (
        <ListingSection title="HOW MANY PIECES IN A PACK">
          <Stepper
            value={working.packageQty ?? 100}
            onChange={(value) => onChange({ ...working, packageQty: value })}
            min={2}
            max={CATALOG_COUNT_MAX}
            step={PACK_STEP}
            unit="pieces"
            accessibilityLabel="Pieces in a pack"
          />
        </ListingSection>
      ) : null}

      {/* A colour price is the whole sheet rate: bulk breaks are not applied on top. */}
      {asksQuantity(working.pricingUnit) && !colourOn(working) ? (
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
            max={CATALOG_COUNT_MAX}
            step={1}
            unit={working.minimumOrderQuantity ? "minimum" : "no minimum"}
            accessibilityLabel="Smallest order you will take"
          />
        </ListingSection>
      ) : null}

      <ListingSection
        title="PRODUCTION TIME"
        hint="Counted on your shop's open hours. It starts from your usual time for this category when you have one."
      >
        <ProductionTimeSection
          listing={listing}
          choice={wizardProductionTime(listing, working, context)}
          touched={working.productionTime != null}
          onChange={(choice) => onChange(withProductionWindow(working, choice))}
          speedTiers={working.speedTiers}
          onSpeedTiersChange={(next) => onChange({ ...working, speedTiers: next })}
          disabled={busy}
          beforeApply={beforeApply}
          afterApply={afterApply}
        />
      </ListingSection>
    </>
  );
}
