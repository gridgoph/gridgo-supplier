import { Plus, Trash2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { CoverageGlyph } from "@/components/CoverageGlyph";
import { SecondaryButton } from "@/components/SecondaryButton";
import { MoneyField } from "@/components/controls/MoneyField";
import { TextField } from "@/components/controls/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import {
  COLOUR_SIZES_MAX,
  TIERS_OF,
  newSizeKey,
  paperReading,
  readPaperSize,
  suggestedPapers,
  tierGlyphBps,
  tierHint,
  tierLabel,
  tierSetOf,
  unpricedSizes,
  type ColourDraft,
  type ColourDraftProblem,
  type ColourSizeDraft,
  type ColourTier,
} from "@/lib/colourPricing";

type Props = {
  value: ColourDraft;
  onChange: (next: ColourDraft) => void;
  /** Paper names the listing's size options carry, offered as one-tap additions. */
  sizeLabels: readonly string[];
  /** The first thing GRIDGO would refuse, shown on its own paper. */
  problem: ColourDraftProblem | null;
  a3LimitBps: number;
  disabled?: boolean;
};

/**
 * The shop's price per sheet for each colour tier, one paper size at a time
 * (gridgo-api `docs/COLOUR_PRICING_API.md`, "Supplier setup").
 *
 * The tier set follows the paper: A3 takes two tiers, every other size the four
 * large-format ones, so the rows change as the shop types the size. A blank
 * price reads "Not offered" — that is what it means, and GRIDGO never fills it.
 */
export function ColourPricingField({ value, onChange, sizeLabels, problem, a3LimitBps, disabled }: Props) {
  const colors = useThemeColors();
  const suggestions = suggestedPapers(sizeLabels, value);
  const full = value.length >= COLOUR_SIZES_MAX;
  const blank = unpricedSizes(value);

  function update(key: string, patch: Partial<ColourSizeDraft>) {
    onChange(value.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function add(paperSize: string) {
    onChange([...value, { key: newSizeKey(), paperSize, prices: {} }]);
  }

  return (
    <View className="gap-3">
      {value.map((row) => (
        <PaperCard
          key={row.key}
          row={row}
          problem={problem?.key === row.key ? problem.message : null}
          a3LimitBps={a3LimitBps}
          disabled={disabled}
          onChange={(patch) => update(row.key, patch)}
          onRemove={() => onChange(value.filter((other) => other.key !== row.key))}
        />
      ))}

      {problem && problem.key == null && value.length ? (
        <Text className="text-body text-error" accessibilityRole="alert">
          {problem.message}
        </Text>
      ) : null}

      {full ? (
        <Text className="text-caption text-text-muted">
          A listing can price at most {COLOUR_SIZES_MAX} paper sizes.
        </Text>
      ) : (
        <View className="gap-2">
          <SecondaryButton label="Add a paper size" onPress={() => add("")} disabled={disabled} />
          {suggestions.length ? (
            <View className="flex-row flex-wrap gap-2">
              {suggestions.map((label) => (
                <Pressable
                  key={label}
                  onPress={() => add(label)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${label}`}
                  className="gg-touch flex-row items-center gap-1 rounded-pill border border-outline bg-surface px-3"
                  style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                >
                  <Plus size={14} color={colors.textPrimary} strokeWidth={2} />
                  <Text className="text-body font-medium text-text-primary">{label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {suggestions.length ? (
            <Text className="text-caption text-text-muted">
              The sizes above come from your size choices. A client&apos;s paper choice picks the table its pages are
              priced from.
            </Text>
          ) : null}
        </View>
      )}

      {blank.length ? (
        <Text className="text-caption text-text-secondary" accessibilityRole="text">
          No tier is priced on {blank.join(", ")}. Every page on that paper will need a price check before the client
          can pay.
        </Text>
      ) : null}
    </View>
  );
}

function PaperCard({
  row,
  problem,
  a3LimitBps,
  disabled,
  onChange,
  onRemove,
}: {
  row: ColourSizeDraft;
  problem: string | null;
  a3LimitBps: number;
  disabled?: boolean;
  onChange: (patch: Partial<ColourSizeDraft>) => void;
  onRemove: () => void;
}) {
  const colors = useThemeColors();
  const paper = readPaperSize(row.paperSize);
  const reading = paperReading(row.paperSize);
  const name = row.paperSize.trim() || "this paper";

  return (
    <View className="gg-card gap-3" testID="colour-paper">
      <View className="flex-row items-end gap-2">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-body font-medium text-text-primary">Paper size</Text>
          <TextField
            value={row.paperSize}
            onChange={(paperSize) => onChange({ paperSize })}
            placeholder="A3 or 20x30"
            accessibilityLabel="Paper size"
            editable={!disabled}
          />
        </View>
        <Pressable
          onPress={onRemove}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${name}`}
          className="gg-touch items-center justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Trash2 size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      </View>
      {problem ? (
        <Text className="text-body text-error" accessibilityRole="alert">
          {problem}
        </Text>
      ) : reading ? (
        <Text className="text-caption text-text-muted">{reading}</Text>
      ) : (
        <Text className="text-caption text-text-muted">A name like A3 or a size like 20x30. A bare size is inches.</Text>
      )}

      {paper ? (
        <View className="gap-2">
          <Text className="text-caption text-text-muted">Your price per sheet, by how much of it is strong colour</Text>
          <View className="rounded-field border border-outline-subtle">
            {TIERS_OF[tierSetOf(paper)].map((tier, index) => (
              <TierRow
                key={tier}
                tier={tier}
                first={index === 0}
                value={row.prices[tier] ?? ""}
                a3LimitBps={a3LimitBps}
                paperName={name}
                disabled={disabled}
                onChange={(price) => onChange({ prices: { ...row.prices, [tier]: price } })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function TierRow({
  tier,
  first,
  value,
  a3LimitBps,
  paperName,
  disabled,
  onChange,
}: {
  tier: ColourTier;
  first: boolean;
  value: string;
  a3LimitBps: number;
  paperName: string;
  disabled?: boolean;
  onChange: (price: string) => void;
}) {
  const label = tierLabel(tier, a3LimitBps);
  return (
    <View
      className={
        first
          ? "flex-row items-center gap-3 px-3 py-3"
          : "flex-row items-center gap-3 border-t border-outline-subtle px-3 py-3"
      }
    >
      <CoverageGlyph bps={tierGlyphBps(tier, a3LimitBps)} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{label}</Text>
        <Text className="text-caption text-text-muted">{tierHint(tier, a3LimitBps)}</Text>
      </View>
      <View className="w-32">
        <MoneyField
          value={value}
          onChange={onChange}
          placeholder="Not offered"
          editable={!disabled}
          accessibilityLabel={`${paperName}, ${label}, your price per sheet. Blank is not offered.`}
        />
      </View>
    </View>
  );
}
