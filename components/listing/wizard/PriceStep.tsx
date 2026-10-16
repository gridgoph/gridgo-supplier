import { Text, View } from "react-native";

import { MoneyField } from "@/components/controls/MoneyField";
import { OptionList } from "@/components/controls/OptionList";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { Stepper } from "@/components/controls/Stepper";
import { ListingSection } from "@/components/listing/ListingSection";
import { PagePricingField, pagePricingApplies } from "@/components/listing/PagePricingField";
import {
  MEASURE_UNITS,
  PRICING_UNITS,
  awaitsFirstApproval,
  measurementKind,
  paperChoices,
  unitChoiceLabel,
  type Listing,
} from "@/lib/listings";
import {
  measureUnitFor,
  needsMeasure,
  packageQtyFor,
  unitHint,
  type ListingDraft,
} from "@/lib/listingDraft";
import { printLayoutsNote, samePrintLayouts } from "@/lib/printLayout";

type Props = {
  /** The listing as GRIDGO holds it: its size choices and saved print layouts. */
  listing: Listing;
  working: ListingDraft;
  onChange: (next: ListingDraft) => void;
};

export function PriceStep({ listing, working, onChange }: Props) {
  const priceField = (
    <MoneyField
      value={working.price}
      onChange={(value) => onChange({ ...working, price: value })}
      accessibilityLabel="Your price"
    />
  );
  return (
    <ListingSection
      title="PRICE"
      hint="Your own asking price. What GRIDGO charges the client on top is not yours to set."
    >
      <OptionList
        options={PRICING_UNITS.map((unit) => ({
          value: unit,
          label: unitChoiceLabel(unit),
          detail: unitHint(unit),
        }))}
        value={working.pricingUnit}
        onChange={(value) =>
          onChange({
            ...working,
            pricingUnit: value,
            measureUnit: measureUnitFor(value, working.measureUnit),
            packageQty: packageQtyFor(value, working.packageQty),
          })
        }
        accessibilityLabel="How this listing is priced"
      />
      {pagePricingApplies(working) ? (
        <PagePricingField
          working={working}
          onChange={onChange}
          sizeLabels={paperChoices(listing)}
          askLayouts={!listing.printLayouts.length}
          layoutsNote={printLayoutsNote({
            layouts: working.printLayouts,
            changed: !samePrintLayouts(working.printLayouts, listing.printLayouts),
            hasApprovedVersion: !awaitsFirstApproval(listing),
            pendingReview: listing.reviewStatus === "pending",
          })}
          priceField={priceField}
        />
      ) : (
        priceField
      )}

      {needsMeasure(working.pricingUnit) ? (
        <View className="gap-2">
          <Text className="text-caption text-text-muted">What you measure in</Text>
          <SegmentedControl
            options={MEASURE_UNITS.map((unit) => ({ value: unit, label: unit }))}
            value={working.measureUnit ?? "ft"}
            onChange={(value) => onChange({ ...working, measureUnit: value })}
            accessibilityLabel="Measurement unit"
          />
        </View>
      ) : null}

      {measurementKind(working.pricingUnit) === "area" ? (
        <View className="gap-2">
          <Text className="text-caption text-text-muted">
            Smallest size you charge for — optional
          </Text>
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Stepper
                value={working.minimumWidth ?? 0}
                onChange={(value) => onChange({ ...working, minimumWidth: value || null })}
                min={0}
                max={100}
                step={1}
                unit={`${working.measureUnit ?? "ft"} wide`}
                accessibilityLabel="Smallest billable width"
              />
            </View>
            <View className="flex-1">
              <Stepper
                value={working.minimumHeight ?? 0}
                onChange={(value) => onChange({ ...working, minimumHeight: value || null })}
                min={0}
                max={100}
                step={1}
                unit={`${working.measureUnit ?? "ft"} tall`}
                accessibilityLabel="Smallest billable height"
              />
            </View>
          </View>
        </View>
      ) : null}

      {measurementKind(working.pricingUnit) === "length" ? (
        <View className="gap-2">
          <Text className="text-caption text-text-muted">
            Shortest you charge for — optional
          </Text>
          <Stepper
            value={working.minimumLength ?? 0}
            onChange={(value) => onChange({ ...working, minimumLength: value || null })}
            min={0}
            max={100}
            step={1}
            unit={working.measureUnit ?? "ft"}
            accessibilityLabel="Shortest billable length"
          />
        </View>
      ) : null}
    </ListingSection>
  );
}
