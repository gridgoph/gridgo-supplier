import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { ColourPricingField } from "@/components/listing/ColourPricingField";
import { PrintLayoutField } from "@/components/listing/PrintLayoutField";
import { useA3Limit } from "@/hooks/useA3Limit";
import {
  COLOUR_LAYOUT_NEEDED,
  COLOUR_MODE_CHOICES,
  COLOUR_TABLE_INTRO,
  ONE_COLOUR_HINT,
  ONE_COLOUR_LABEL,
  colourModeHint,
  readColourDraft,
} from "@/lib/colourPricing";
import { colourOn, type ListingDraft } from "@/lib/listingDraft";

type Props = {
  working: ListingDraft;
  onChange: (next: ListingDraft) => void;
  /** Paper names from the listing's size choices. */
  sizeLabels: readonly string[];
  /**
   * Draw the print layout picker here. True while the listing as saved has
   * none, so a colour table is never held behind a step further down; read
   * from what GRIDGO holds rather than the draft so it does not vanish mid-tap.
   */
  askLayouts: boolean;
  layoutsNote: string[];
  /** The listing's one price field, drawn here while every page costs the same. */
  priceField: ReactNode;
  disabled?: boolean;
};

/** Whether the per-page choice applies; when it does not, the caller draws its price field itself. */
export function pagePricingApplies(working: Pick<ListingDraft, "pricedByColour" | "pricingUnit">): boolean {
  return working.pricedByColour != null && working.pricingUnit === "per_page";
}

/**
 * How a per-page listing is priced: the same price every page, or by colour
 * (issue report 0BE07331): the choice, then the colour table when it is
 * chosen, or the caller's one price field and the one-colour switch when not.
 * Draws nothing on a GRIDGO without colour pricing or on any other unit.
 */
export function PagePricingField({
  working,
  onChange,
  sizeLabels,
  askLayouts,
  layoutsNote,
  priceField,
  disabled,
}: Props) {
  const a3LimitBps = useA3Limit();
  if (!pagePricingApplies(working)) return null;
  const on = colourOn(working);
  const read = readColourDraft(working.colour);
  // An empty table is said by the button, not by a red line before anything was typed.
  const problem = !read.ok && (read.problem.key != null || working.colour.length) ? read.problem : null;

  return (
    <View className="gap-3">
      <View className="gap-2">
        <Text className="text-body font-medium text-text-primary">How each page is priced</Text>
        <SegmentedControl
          options={COLOUR_MODE_CHOICES}
          value={on ? "colour" : "fixed"}
          onChange={(mode) => onChange({ ...working, pricedByColour: mode === "colour" })}
          accessibilityLabel="How each page is priced"
          disabled={disabled}
        />
        <Text className="text-caption text-text-muted">{colourModeHint(on)}</Text>
      </View>

      {on ? (
        <>
          <Text className="text-body text-text-secondary">{COLOUR_TABLE_INTRO}</Text>
          {askLayouts ? (
            <View className="gap-3 rounded-field border border-warning p-3">
              <Text className="text-body text-text-primary">{COLOUR_LAYOUT_NEEDED}</Text>
              <PrintLayoutField
                value={working.printLayouts}
                onChange={(printLayouts) => onChange({ ...working, printLayouts })}
                note={layoutsNote}
                disabled={disabled}
              />
            </View>
          ) : null}
          <ColourPricingField
            value={working.colour}
            onChange={(colour) => onChange({ ...working, colour })}
            sizeLabels={sizeLabels}
            problem={problem}
            a3LimitBps={a3LimitBps}
            disabled={disabled}
          />
        </>
      ) : (
        <>
          {priceField}
          <SwitchRow
            value={working.oneColour}
            onChange={(oneColour) => onChange({ ...working, oneColour })}
            label={ONE_COLOUR_LABEL}
            hint={ONE_COLOUR_HINT}
            disabled={disabled}
          />
        </>
      )}
    </View>
  );
}
