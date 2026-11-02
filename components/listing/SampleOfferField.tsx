import { Text, View } from "react-native";

import { MoneyField } from "@/components/controls/MoneyField";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { colourOn, sampleHold, type ListingDraft } from "@/lib/listingDraft";
import {
  SAMPLE_COLOUR_NOTE,
  SAMPLE_LIVE_NOTE,
  SAMPLE_PRICE_LABEL,
  SAMPLE_SWITCH_HINT,
  SAMPLE_SWITCH_LABEL,
  sampleHoldLine,
} from "@/lib/sampleFirst";

type Props = {
  working: ListingDraft;
  onChange: (next: ListingDraft) => void;
  /** `sampleBatchHoldDays` from GRIDGO's settings. */
  holdDays: number;
  disabled?: boolean;
};

/**
 * "Sample available" and the price of one sample (`lib/sampleFirst.ts`).
 *
 * Saved with the rest of the listing, but live at once: GRIDGO does not send
 * it to review, and the copy says so. A colour-priced listing cannot offer
 * one, so it gets the sentence instead of a switch it could not save.
 */
export function SampleOfferField({ working, onChange, holdDays, disabled = false }: Props) {
  if (colourOn(working)) {
    return <Text className="text-body text-text-secondary">{SAMPLE_COLOUR_NOTE}</Text>;
  }
  // A blank price is the next step, said quietly; a wrong one is an error.
  const problem = working.sampleAvailable ? sampleHold(working) : null;
  const blank = !working.samplePrice.trim();
  return (
    <View className="gap-3">
      <SwitchRow
        value={working.sampleAvailable === true}
        onChange={(value) => onChange({ ...working, sampleAvailable: value })}
        label={SAMPLE_SWITCH_LABEL}
        hint={SAMPLE_SWITCH_HINT}
        disabled={disabled}
      />
      {working.sampleAvailable ? (
        <View className="gap-2">
          <Text className="text-caption text-text-muted">{SAMPLE_PRICE_LABEL}</Text>
          <MoneyField
            value={working.samplePrice}
            onChange={(value) => onChange({ ...working, samplePrice: value })}
            accessibilityLabel={SAMPLE_PRICE_LABEL}
            editable={!disabled}
          />
          {problem ? (
            <Text className={blank ? "text-caption text-text-secondary" : "text-caption text-error"}>{problem}</Text>
          ) : null}
          <Text className="text-caption text-text-muted">{sampleHoldLine(holdDays)}</Text>
        </View>
      ) : null}
      <Text className="text-caption text-text-muted">{SAMPLE_LIVE_NOTE}</Text>
    </View>
  );
}
