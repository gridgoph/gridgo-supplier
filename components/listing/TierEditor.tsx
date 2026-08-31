import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { MoneyField } from "@/components/controls/MoneyField";
import { Stepper } from "@/components/controls/Stepper";
import { TextField } from "@/components/controls/TextField";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import type { PriceTier, SpeedTier } from "@/lib/listings";

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

  const sorted = [...tiers].sort((left, right) => left.minQuantity - right.minQuantity);

  const add = () => {
    const pesos = Number.parseFloat(draftPrice);
    if (!draftQty || draftQty < 1 || !Number.isFinite(pesos) || pesos < 0) return;
    if (sorted.some((tier) => tier.minQuantity === draftQty)) return;
    onChange([...sorted, { minQuantity: draftQty, unitPriceMinor: Math.round(pesos * 100) }]);
    setDraftQty(0);
    setDraftPrice("");
  };

  return (
    <View className="gap-2">
      <Text className="text-caption text-text-muted">
        Cheaper in bulk — optional. From this many, your rate becomes the one you set here.
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
            <Text className="text-caption text-text-muted">{unitLabel}</Text>
          </Text>
        </RowShell>
      ))}

      <View className="gg-panel gap-2 p-3">
        <Stepper
          value={draftQty}
          onChange={setDraftQty}
          min={0}
          max={100000}
          step={10}
          unit={draftQty ? "and over" : "from how many"}
          accessibilityLabel="Quantity this break starts at"
        />
        <MoneyField
          value={draftPrice}
          onChange={setDraftPrice}
          accessibilityLabel="Rate at this quantity"
        />
        <SecondaryButton
          label="Add this break"
          onPress={add}
          disabled={!draftQty || !draftPrice.trim()}
        />
      </View>
    </View>
  );
}

export function SpeedTierEditor({
  tiers,
  onChange,
}: {
  tiers: SpeedTier[];
  onChange: (next: SpeedTier[]) => void;
}) {
  const [label, setLabel] = useState("");
  const [hours, setHours] = useState(24);
  const [price, setPrice] = useState("");

  const sorted = [...tiers].sort((left, right) => left.turnaroundHours - right.turnaroundHours);

  const add = () => {
    const pesos = Number.parseFloat(price);
    if (!label.trim() || !hours || !Number.isFinite(pesos) || pesos < 0) return;
    if (sorted.some((tier) => tier.turnaroundHours === hours)) return;
    onChange([
      ...sorted,
      {
        id: `speed_${hours}`,
        label: label.trim(),
        turnaroundHours: hours,
        // A speed the shop prices is a price for the job at that speed, not a
        // fee on top. A rush fee is the other shape and is not offered here,
        // because a shop that wants one writes it as an add-on.
        priceMinor: Math.round(pesos * 100),
        surchargeMinor: null,
      },
    ]);
    setLabel("");
    setPrice("");
  };

  return (
    <View className="gap-2">
      <Text className="text-caption text-text-muted">
        Faster, for more — optional. A client&rsquo;s date picks one of these, so each is a
        price for the whole job at that speed, not a fee on top.
      </Text>

      {sorted.map((tier) => (
        <RowShell
          key={tier.turnaroundHours}
          removeLabel={`Remove ${tier.label}`}
          onRemove={() => onChange(sorted.filter((row) => row.turnaroundHours !== tier.turnaroundHours))}
        >
          <Text className="text-body text-text-primary">{tier.label}</Text>
          <Text className="text-body-lg text-text-primary font-medium">
            {tier.priceMinor != null ? api.formatPhp(tier.priceMinor) : `+${api.formatPhp(tier.surchargeMinor ?? 0)}`}{" "}
            <Text className="text-caption text-text-muted">
              {tier.turnaroundHours} hours
            </Text>
          </Text>
        </RowShell>
      ))}

      <View className="gg-panel gap-2 p-3">
        <TextField
          value={label}
          onChange={setLabel}
          placeholder="What you call it — 3 days, same day"
          accessibilityLabel="What this speed is called"
        />
        <Stepper
          value={hours}
          onChange={setHours}
          min={1}
          max={720}
          step={1}
          unit="hours"
          accessibilityLabel="Hours this speed takes"
        />
        <MoneyField value={price} onChange={setPrice} accessibilityLabel="Price at this speed" />
        <SecondaryButton
          label="Add this speed"
          onPress={add}
          disabled={!label.trim() || !price.trim()}
        />
      </View>
    </View>
  );
}
