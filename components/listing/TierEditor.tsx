import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { MoneyField } from "@/components/controls/MoneyField";
import { Stepper } from "@/components/controls/Stepper";
import { TextField } from "@/components/controls/TextField";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  BULK_BREAK_CAP,
  CATALOG_COUNT_MAX,
  DUPLICATE_BULK_BREAK,
  MAX_BULK_BREAKS,
  MAX_SPEEDS,
  SPEED_CAP,
} from "@/lib/catalogBounds";
import type { PriceTier, SpeedTier } from "@/lib/listings";
import { parseMoney } from "@/lib/money";
import { ProductionTimePicker } from "@/components/listing/ProductionTimeField";
import {
  sameTime,
  timeKey,
  timeLabel,
  timeMinutes,
  workingDays,
  type ProductionTime,
} from "@/lib/productionDays";

/**
 * Bulk breaks and speeds, edited as the short lists they are.
 *
 * Both are a handful of rows a shop writes once and adjusts rarely, so they are
 * edited in place rather than behind a sheet: a shop pricing mugs wants to see
 * the whole ladder at once, because the only thing worth checking is whether
 * the numbers still descend.
 *
 * Neither is required. A listing that sells one thing at one price never draws
 * either of these, and both start empty with a single quiet invitation.
 */

function RowShell({
  children,
  onRemove,
  removeLabel,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  const colors = useThemeColors();
  return (
    <View className="gg-panel flex-row items-end gap-2 p-3">
      <View className="min-w-0 flex-1 gap-2">{children}</View>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={removeLabel}
        hitSlop={8}
        className="gg-touch items-center justify-center"
      >
        <Trash2 size={18} color={colors.error} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

export function PriceTierEditor({
  tiers,
  unitLabel,
  onChange,
}: {
  tiers: PriceTier[];
  /** "per piece", "per pack of 100" — so a rate reads as what it is. */
  unitLabel: string;
  onChange: (next: PriceTier[]) => void;
}) {
  const [draftQty, setDraftQty] = useState(0);
  const [draftPrice, setDraftPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sorted = [...tiers].sort((left, right) => left.minQuantity - right.minQuantity);
  const full = sorted.length >= MAX_BULK_BREAKS;

  const add = () => {
    if (!draftQty || draftQty < 1) {
      setError("A bulk break starts at a whole quantity of at least 1.");
      return;
    }
    if (sorted.some((tier) => tier.minQuantity === draftQty)) {
      setError(DUPLICATE_BULK_BREAK);
      return;
    }
    const money = parseMoney(draftPrice);
    if (!money.ok) {
      setError(money.error);
      return;
    }
    if (money.minor == null) {
      setError("Enter the unit price for this quantity.");
      return;
    }
    onChange([...sorted, { minQuantity: draftQty, unitPriceMinor: money.minor }]);
    setDraftQty(0);
    setDraftPrice("");
    setError(null);
  };

  return (
    <View className="gap-2">
      <Text className="text-caption text-text-muted">
        Cheaper in bulk — optional. From this many, your rate becomes the one you set here.
        This is a unit price ({unitLabel}), not a price for the whole job.
      </Text>

      {sorted.map((tier) => (
        <RowShell
          key={tier.minQuantity}
          removeLabel={`Remove the break at ${tier.minQuantity}`}
          onRemove={() => onChange(sorted.filter((row) => row.minQuantity !== tier.minQuantity))}
        >
          <Text className="text-body text-text-primary">
            {tier.minQuantity} and over
          </Text>
          <Text className="text-body-lg text-text-primary font-medium">
            {api.formatPhp(tier.unitPriceMinor)}{" "}
            <Text className="text-caption text-text-muted">{unitLabel} · Unit price</Text>
          </Text>
        </RowShell>
      ))}

      <View className="gg-panel gap-2 p-3">
        {full ? (
          <Text className="text-caption text-text-muted">{BULK_BREAK_CAP}</Text>
        ) : (
          <>
        <Stepper
          value={draftQty}
          onChange={(value) => {
            setDraftQty(value);
            setError(null);
          }}
          min={0}
          max={CATALOG_COUNT_MAX}
          step={10}
          unit={draftQty ? "and over" : "from how many"}
          accessibilityLabel="Quantity this break starts at"
        />
        <MoneyField
          value={draftPrice}
          onChange={(value) => {
            setDraftPrice(value);
            setError(null);
          }}
          accessibilityLabel="Rate at this quantity"
        />
        {error ? (
          <Text className="text-caption text-error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <SecondaryButton
          label="Add this break"
          onPress={add}
          disabled={!draftQty || !draftPrice.trim()}
        />
          </>
        )}
      </View>
    </View>
  );
}

export function SpeedTierEditor({
  tiers,
  onChange,
  dayMinutes,
  unitLabel,
}: {
  tiers: SpeedTier[];
  onChange: (next: SpeedTier[]) => void;
  /** The shop's working day, which a same-day speed must stay under. */
  dayMinutes?: number;
  unitLabel: string;
}) {
  const [label, setLabel] = useState("");
  const [time, setTime] = useState<ProductionTime>(workingDays(1));
  const [price, setPrice] = useState("");
  const [error, setError] = useState<string | null>(null);

  const sorted = [...tiers].sort(
    (left, right) => timeMinutes(left.turnaround, dayMinutes) - timeMinutes(right.turnaround, dayMinutes),
  );
  // One speed per time: a second "1 hour" would leave a client's date nothing to choose between.
  const taken = sorted.some((tier) => sameTime(tier.turnaround, time));
  const full = sorted.length >= MAX_SPEEDS;

  const add = () => {
    if (!label.trim() || taken) return;
    const money = parseMoney(price);
    if (!money.ok) {
      setError(money.error);
      return;
    }
    if (money.minor == null) {
      setError("Enter the price for this speed.");
      return;
    }
    onChange([
      ...sorted,
      {
        id: `speed_${timeKey(time)}`,
        label: label.trim(),
        turnaround: time,
        // A priced speed replaces the listing rate for the same pricing unit.
        priceMinor: money.minor,
        surchargeMinor: null,
      },
    ]);
    setLabel("");
    setPrice("");
    setError(null);
  };

  return (
    <View className="gap-2">
      <Text className="text-caption text-text-muted">
        Faster, for more — optional. A client&rsquo;s date picks one of these. Set your price
        {" "}{unitLabel} at each speed. This replaces your usual rate.
      </Text>

      {sorted.map((tier) => (
        <RowShell
          key={timeKey(tier.turnaround)}
          removeLabel={`Remove ${tier.label}`}
          onRemove={() => onChange(sorted.filter((row) => !sameTime(row.turnaround, tier.turnaround)))}
        >
          <Text className="text-body text-text-primary">{tier.label}</Text>
          <Text className="text-body-lg text-text-primary font-medium">
            {tier.priceMinor != null ? api.formatPhp(tier.priceMinor) : `+${api.formatPhp(tier.surchargeMinor ?? 0)}`}{" "}
            <Text className="text-caption text-text-muted">
              {timeLabel(tier.turnaround)} · {tier.priceMinor != null ? unitLabel : "Fee on top"}
            </Text>
          </Text>
        </RowShell>
      ))}

      <View className="gg-panel gap-2 p-3">
        <TextField
          value={label}
          onChange={setLabel}
          placeholder="What you call it — Rush, Priority"
          accessibilityLabel="What this speed is called"
        />
        <ProductionTimePicker
          time={time}
          onChange={setTime}
          dayMinutes={dayMinutes}
          accessibilityLabel="How long this speed takes"
          unitLabel="Count this speed in"
        />
        {taken ? (
          <Text className="text-caption text-text-muted">
            You already sell a speed at {timeLabel(time)}. Pick another time, or remove that one first.
          </Text>
        ) : null}
        {full ? (
          <Text className="text-caption text-text-muted">{SPEED_CAP}</Text>
        ) : (
          <>
        <Text className="text-caption text-text-secondary">Price {unitLabel} at this speed</Text>
        <MoneyField
          value={price}
          onChange={(value) => {
            setPrice(value);
            setError(null);
          }}
          accessibilityLabel="Price at this speed"
        />
        {error ? (
          <Text className="text-caption text-error" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <SecondaryButton
          label="Add this speed"
          onPress={add}
          disabled={!label.trim() || !price.trim() || taken}
        />
          </>
        )}
      </View>
    </View>
  );
}
